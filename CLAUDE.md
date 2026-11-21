# CanchaYa — SaaS de reservas de canchas de fútbol

Trabajo final del curso **Cloud Computing** (Ingeniería de Software). Entrega: lunes 23-nov-2026, 23:00.
Prioridad: que funcione y se pueda demostrar en vivo. Código claro y comentado (el grupo debe poder explicarlo en la exposición). Nada de sobreingeniería.

## Qué es
Plataforma SaaS **multi-tenant**: varios complejos deportivos (tenants) publican sus canchas en la misma plataforma; los jugadores buscan canchas en un mapa, reservan por horas y pagan en línea. Cada complejo solo ve y administra sus propios datos.

## Roles
| Rol | Qué hace | MFA |
|---|---|---|
| `admin` | Gestiona usuarios y roles, aprueba/suspende complejos, ve métricas globales, exporta reportes | Obligatorio (AAL2) |
| `propietario` | Gestiona su(s) complejo(s), canchas, precios y horarios; ve su agenda y métricas de ocupación/ingresos | Obligatorio (AAL2) |
| `jugador` | Busca canchas (lista + mapa), reserva, paga, ve/cancela sus reservas | Opcional |

Registro público crea siempre `jugador`. Un jugador puede "solicitar ser propietario" (registra un complejo en estado `pendiente`); el admin lo aprueba y le cambia el rol.

## Arquitectura (Opción B)
```
[Navegador] → Vercel (React SPA, CDN)
                 ├─→ Supabase (Auth + MFA TOTP, Postgres con RLS, Storage)   ← lecturas/escrituras simples directas
                 └─→ Render (FastAPI en Docker)                               ← lógica con secretos
                         ├─→ Supabase (service role)
                         ├─→ Stripe (Checkout, modo prueba)
                         └─→ Resend (correo de confirmación)
Supabase pg_cron → Edge Function `send-reminders` → Resend (recordatorio diario)
GitHub → GitHub Actions (CI) → Vercel / Render (auto-deploy)
UptimeRobot → GET /health del backend (monitoreo + evita que Render duerma)
```

## Stack
- `frontend/`: React + Vite + TypeScript, Tailwind CSS, React Router, `@supabase/supabase-js`, Recharts, react-leaflet (OpenStreetMap, sin API key), lucide-react. Español en toda la UI.
- `backend/`: Python 3.12, FastAPI, uvicorn, `supabase` (py), `stripe`, `resend`, pydantic-settings. Dockerfile. Auth: el front envía `Authorization: Bearer <access_token>` de Supabase; el backend lo valida con `supabase.auth.get_user(token)` y lee el rol de `profiles`.
- `supabase/`: `migrations/*.sql`, `seed.sql`, `functions/send-reminders/` (Deno + Resend).
- `.github/workflows/ci.yml`: build del front + lint/test del back + build de la imagen Docker.
- `docs/`: diagramas (Mermaid), tabla de módulos, notas para el informe.

## Modelo de datos (Postgres)
- `profiles` (id = auth.users.id, nombre, telefono, rol `rol_usuario` enum admin|propietario|jugador, created_at). Trigger crea el perfil al registrarse.
- `complejos` (id, propietario_id → profiles, nombre, descripcion, direccion, distrito, lat, lng, foto_url, hora_apertura, hora_cierre, estado enum pendiente|activo|suspendido, created_at)  ← **tenant**
- `canchas` (id, complejo_id, nombre, tipo enum futbol5|futbol7|futbol11, superficie enum sintetico|natural|losa, precio_hora numeric, activa bool)
- `reservas` (id, cancha_id, jugador_id, fecha date, hora_inicio time, hora_fin time, monto, estado enum pendiente_pago|pagada|cancelada|completada, stripe_session_id, recordatorio_enviado bool, created_at). Restricción EXCLUDE (btree_gist) para impedir reservas solapadas en la misma cancha (ignorando canceladas).
- `pagos` (id, reserva_id, monto, moneda, stripe_session_id, stripe_payment_intent, estado, created_at)
- `notificaciones_log` (id, reserva_id, tipo, destinatario, estado, created_at)
- Vistas para métricas: ocupación por cancha, ingresos por día, reservas por estado, horas pico.

**RLS en todas las tablas**: jugador ve solo sus reservas; propietario ve solo complejos/canchas/reservas de sus complejos; admin ve todo; complejos y canchas activos son de lectura pública. Helper `public.mi_rol()` (security definer). Las escrituras de rol y de estado de pago solo desde backend (service role).

## Reglas de trabajo
- **Claude NO hace commits ni push** (ni `git commit`, `git merge`, `git push`, PR, ni nada que cambie el historial o GitHub). Todos los commits y pushes los hace solo quien administra el repo. Claude deja los cambios en el directorio de trabajo y, al terminar cada parte, sugiere un mensaje de commit en español con prefijo (`feat:`, `fix:`, `docs:`, `chore:`).
- Nunca subir secretos: usar `.env` (en `.gitignore`) y `.env.example` documentado.
- Moneda PEN (si Stripe en modo prueba no la acepta, usar USD y anotarlo en docs).
- Zona horaria America/Lima.
- Al terminar cada parte, actualizar `docs/AVANCE.md` con lo hecho y cómo probarlo.
