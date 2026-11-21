# Arquitectura de CanchaYa

CanchaYa es un **SaaS multi-tenant**: varios complejos deportivos (tenants) comparten la misma aplicación y la misma base de datos, y cada uno ve solo sus datos. El aislamiento lo hace **Row Level Security (RLS)** de Postgres, no el código de la aplicación.

Se eligió la **Opción B**: el navegador habla directo con Supabase para lo simple (protegido por RLS) y con un backend propio para lo que necesita secretos (Stripe, correo, service role).

## 1. Arquitectura cloud

```mermaid
flowchart LR
    U["Navegador<br/>(jugador, propietario, admin)"]

    subgraph Vercel["Vercel · CDN global"]
        SPA["React SPA<br/>Vite + TypeScript + Tailwind"]
    end

    subgraph Render["Render · contenedor Docker"]
        API["FastAPI<br/>pagos · reportes · admin · tareas"]
    end

    subgraph Supabase["Supabase · São Paulo"]
        AUTH["Auth<br/>email + MFA TOTP"]
        DB[("Postgres<br/>RLS en todas las tablas")]
        ST["Storage<br/>fotos de complejos"]
        EF["Edge Function<br/>send-reminders (Deno)"]
        CRON["pg_cron + pg_net"]
        VAULT["Vault<br/>secretos del cron"]
    end

    STRIPE["Stripe Checkout<br/>(modo prueba)"]
    RESEND["Resend<br/>correo"]
    GH["GitHub<br/>repo + Actions (CI)"]
    UR["UptimeRobot"]

    U -->|HTTPS| SPA
    SPA -->|"supabase-js (anon key + JWT)<br/>lecturas/escrituras con RLS"| AUTH
    SPA --> DB
    SPA --> ST
    SPA -->|"Bearer JWT"| API
    API -->|service role| DB
    API -->|"Checkout Session"| STRIPE
    STRIPE -->|"webhook firmado"| API
    API -->|"confirmación"| RESEND
    CRON -->|"18:00 Lima"| EF
    CRON -.->|"cada 15 min (tras el deploy)"| API
    VAULT -.-> CRON
    EF --> DB
    EF -->|"recordatorio"| RESEND
    GH -->|"push a main"| Vercel
    GH -->|"push a main"| Render
    UR -->|"GET /health cada 5 min"| API
```

| Capa | Servicio | Modelo cloud | Qué hace |
|---|---|---|---|
| Presentación | **Vercel** | PaaS / CDN | Sirve la SPA compilada desde la red global; HTTPS automático; despliegue en cada push. |
| Lógica con secretos | **Render** | PaaS (contenedor Docker) | API FastAPI: pagos (Stripe), correo (Resend), reportes CSV/PDF, panel admin, tareas programadas. |
| Datos y auth | **Supabase** | BaaS (DBaaS + Auth + Storage + FaaS) | Postgres administrado, RLS, autenticación con MFA, archivos, Edge Functions, cron. |
| Pagos | **Stripe** | SaaS | Checkout alojado por Stripe (el número de tarjeta nunca pasa por nuestros servidores). |
| Correo | **Resend** | SaaS | Envío transaccional (confirmación y recordatorio). |
| CI/CD | **GitHub Actions** | SaaS | Lint, build, pruebas e imagen Docker en cada push. |
| Monitoreo | **UptimeRobot** | SaaS | Disponibilidad de `/health` cada 5 min (y evita que Render se duerma). |

### ¿Por qué esta división?
- **Lo simple va directo a Supabase** (buscar canchas, crear una reserva, editar canchas): menos código y menos latencia. La seguridad no depende del frontend: RLS decide qué filas se ven o se modifican.
- **Lo que necesita secretos va al backend**: la llave de Stripe, la de Resend y la *service role* de Supabase nunca llegan al navegador.
- **Lo periódico vive en la base**: `pg_cron` dispara la Edge Function y la limpieza, sin servidores extra.

## 2. Modelo de datos (ER)

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1 a 1 (trigger al registrarse)"
    PROFILES ||--o{ COMPLEJOS : "propietario_id (tenant)"
    COMPLEJOS ||--o{ CANCHAS : tiene
    CANCHAS ||--o{ RESERVAS : recibe
    PROFILES ||--o{ RESERVAS : "jugador_id"
    RESERVAS ||--o{ PAGOS : genera
    RESERVAS ||--o{ NOTIFICACIONES_LOG : registra

    PROFILES {
        uuid id PK "= auth.users.id"
        text nombre
        text telefono
        rol_usuario rol "admin, propietario, jugador"
        timestamptz created_at
    }
    COMPLEJOS {
        uuid id PK
        uuid propietario_id FK
        text nombre
        text direccion
        text distrito
        float lat
        float lng
        text foto_url
        time hora_apertura
        time hora_cierre
        estado_complejo estado "pendiente, activo, suspendido"
    }
    CANCHAS {
        uuid id PK
        uuid complejo_id FK
        text nombre
        tipo_cancha tipo "futbol5, futbol7, futbol11"
        superficie_cancha superficie "sintetico, natural, losa"
        numeric precio_hora
        bool activa
    }
    RESERVAS {
        uuid id PK
        uuid cancha_id FK
        uuid jugador_id FK
        date fecha
        time hora_inicio
        time hora_fin
        numeric monto "lo calcula un trigger"
        estado_reserva estado "pendiente_pago, pagada, cancelada, completada"
        bool es_bloqueo "reserva interna del propietario"
        text stripe_session_id
        bool recordatorio_enviado
    }
    PAGOS {
        uuid id PK
        uuid reserva_id FK
        numeric monto
        text moneda
        text stripe_session_id UK "idempotencia"
        text stripe_payment_intent
        estado_pago estado
    }
    NOTIFICACIONES_LOG {
        uuid id PK
        uuid reserva_id FK
        text tipo "confirmacion, recordatorio"
        text destinatario
        text estado "enviado, error, omitido"
        text detalle
    }
    CONFIGURACION {
        int id PK "siempre 1"
        numeric comision_pct
        int minutos_expiracion
    }
```

Reglas clave en la base:
- **`reservas_sin_solapamiento`**: restricción `EXCLUDE USING gist (cancha_id WITH =, tsrange(fecha+hora_inicio, fecha+hora_fin) WITH &&) WHERE estado <> 'cancelada'`. Dos personas no pueden reservar la misma cancha a la misma hora aunque pulsen a la vez: la base rechaza la segunda (`23P01`).
- **Trigger `validar_reserva`**: calcula el monto (el cliente no puede inventar el precio), exige horario de atención y que no sea en el pasado.
- **Vistas y funciones de métricas** (`v_*`, `metricas()`, `resumen_jugador()`) con `security_invoker`: respetan RLS.

## 3. Flujo de reserva y pago

```mermaid
sequenceDiagram
    autonumber
    actor J as Jugador
    participant F as Frontend (Vercel)
    participant DB as Supabase (Postgres + RLS)
    participant API as Backend (Render)
    participant S as Stripe
    participant R as Resend

    J->>F: Elige cancha, fecha y 1-3 horas
    F->>DB: rpc disponibilidad(cancha, fecha)
    DB-->>F: grilla de horas libres/ocupadas
    J->>F: "Reservar y pagar"
    F->>DB: INSERT reserva (pendiente_pago)
    Note over DB: RLS: jugador_id = auth.uid()<br/>Trigger: calcula monto<br/>EXCLUDE: sin choques (23P01)
    DB-->>F: reserva creada
    F->>API: POST /pagos/checkout {reserva_id} + Bearer JWT
    API->>DB: ¿es suya y está pendiente? (service role)
    API->>S: crear Checkout Session (PEN, expira en 30 min)
    S-->>API: url de pago
    API-->>F: {url}
    F->>S: redirige al Checkout de Stripe
    J->>S: paga con tarjeta (4242 4242 4242 4242)
    S-->>F: redirige a /pago/exito?session_id=…
    F->>API: POST /pagos/verificar {session_id}
    par Confirmación (idempotente)
        API->>S: consultar sesión → paid
        API->>DB: UPDATE … SET pagada WHERE estado = pendiente_pago
        API->>DB: INSERT pago (único por stripe_session_id)
        API->>R: correo de confirmación
        API->>DB: notificaciones_log
    and Webhook (por si el usuario cierra la pestaña)
        S->>API: POST /pagos/webhook (firma Stripe-Signature)
        API->>DB: mismo UPDATE condicional (solo uno gana)
    end
    API-->>F: comprobante
    Note over DB,API: Si no paga: pg_cron cada 15 min → /tareas/limpiar-pendientes<br/>expira la sesión de Stripe y cancela la reserva (libera la hora)
```

## 4. Login con MFA (TOTP)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant F as Frontend
    participant A as Supabase Auth
    participant DB as Postgres (RLS)

    U->>F: email + contraseña
    F->>A: signInWithPassword
    A-->>F: sesión con JWT aal1
    F->>DB: leer profiles.rol (permitido con aal1)
    alt admin o propietario SIN factor
        F->>U: /mfa/configurar (obligatorio)
        F->>A: mfa.enroll(totp) → QR + secreto
        U->>F: código de 6 dígitos de la app autenticadora
        F->>A: mfa.challenge + mfa.verify
    else tiene factor y sesión aal1
        F->>U: /mfa/verificar
        U->>F: código de 6 dígitos
        F->>A: mfa.challenge + mfa.verify
    end
    A-->>F: nuevo JWT con aal = aal2
    F->>U: panel según rol
    Note over DB: Política RESTRICTIVE mfa_ok():<br/>admin/propietario con aal1 → 0 filas de negocio
    Note over F: Backend: require_role exige aal2<br/>para admin y propietario (403 si no)
```

## 5. Despliegue y CI/CD

```mermaid
flowchart LR
    DEV["Desarrollador<br/>git push main"] --> GH["GitHub"]
    GH --> CI["GitHub Actions · ci.yml"]
    subgraph CI_JOBS["Jobs en paralelo"]
        FE["frontend<br/>npm ci · lint · build"]
        BE["backend<br/>pip install · pytest"]
        DK["docker<br/>build imagen · prueba /health"]
    end
    CI --> FE
    CI --> BE
    BE --> DK
    GH -->|"webhook de Git"| VER["Vercel<br/>build Vite → CDN"]
    GH -->|"autoDeploy (render.yaml)"| REN["Render<br/>build Dockerfile → contenedor"]
    REN -->|"healthCheckPath /health"| REN
    SB["Supabase CLI<br/>db push · functions deploy · secrets set"] --> SUP["Supabase"]
    UR["UptimeRobot"] -->|"cada 5 min"| REN
```

- **Infraestructura como código**: `render.yaml` (Blueprint), `frontend/vercel.json`, `supabase/migrations/*.sql`, `supabase/config.toml`, `.github/workflows/ci.yml`.
- **Migraciones versionadas**: cada cambio de la base es un archivo SQL con fecha; `supabase db push` aplica solo los nuevos.
- **Health checks**: Render reinicia el contenedor si `/health` deja de responder; UptimeRobot alerta por correo.
