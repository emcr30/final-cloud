# Pruebas de CanchaYa

Resumen (21-nov-2026):

| Tipo | Herramienta | Resultado |
|---|---|---|
| Pruebas unitarias / de API del backend | `pytest` (43 pruebas) | ✅ 43/43 |
| Calidad del frontend | `oxlint` + `tsc` + `vite build` | ✅ 0 errores, 0 avisos |
| Aislamiento multi-tenant (RLS) | `supabase/tests/aislamiento_multitenant.sql` | ✅ 24/24 |
| Funcionales E2E por API (Supabase, Stripe y Resend reales) | scripts de prueba con `httpx` | ✅ 68/68 comprobaciones (Partes 4-8) |
| Carga | `scripts/prueba_carga.py` | ✅ 0 errores en 2 300 peticiones |
| Pendientes en navegador | manual | ver sección 6 |

## 1. Pruebas automáticas del backend (pytest)

`cd backend && .venv/bin/pytest -v` — no necesitan Supabase, Stripe ni Resend (usan dobles de prueba), por eso corren igual en GitHub Actions.

| Archivo | Qué verifica |
|---|---|
| `test_health.py` (6) | `/health` responde; `/health/servicios` solo devuelve sí/no; **rate limit → 429** al pasar 100/min; `/health` exento; **CORS** no responde a orígenes ajenos |
| `test_config.py` | Rechaza la llave pública o el placeholder como service role |
| `test_auth.py` (6) | 401 sin token; lectura del claim `aal`; rol incorrecto → 403; **admin sin MFA → 403**; jugador sin MFA permitido; `require_aal2` |
| `test_pagos.py` (9) | Checkout sin token → 401; webhook sin secreto → 503 y con firma falsa → 400; `X-Cron-Secret`; céntimos; fecha en español; escape de HTML en el correo |
| `test_reportes.py` (8) | Export sin token → 401; jugador → 403; **propietario no ve reservas de otro propietario**; complejo ajeno → 404; PDF válido; rango inválido → 400; bloqueos no cuentan como ingreso |
| `test_admin.py` (8) | `/admin` sin token → 401; propietario → 403; admin sin MFA → 403; no puede quitarse el rol ni suspenderse; rol inválido → 422; ban vigente; crecimiento semanal |

## 2. Prueba de aislamiento multi-tenant

**Objetivo**: demostrar que un complejo (tenant) no puede ver ni modificar los datos de otro, aunque llame directo a la API.

**Método**: `supabase db query --remote --yes -f supabase/tests/aislamiento_multitenant.sql`. El script se pone en el lugar de cada usuario igual que PostgREST (`set role authenticated` + claims del JWT: `sub`, `aal`) dentro de una transacción con **ROLLBACK** (no cambia datos). Datos: propietario1 (P1) tiene 3 complejos, propietario2 (P2) tiene 2.

| # | Prueba | Esperado | Obtenido | OK |
|---|---|---|---|:-:|
| 1 | P1 ve sus propias reservas (control) | > 0 | 1008 | ✅ |
| 2 | P1 ve reservas de complejos de P2 | 0 | 0 | ✅ |
| 3 | P1 ve reservas de cualquier complejo ajeno | 0 | 0 | ✅ |
| 4 | P1 ve pagos de reservas de P2 | 0 | 0 | ✅ |
| 5 | P1 ve ingresos (`v_ingresos_diarios`) de P2 | 0 | 0 | ✅ |
| 6 | `metricas()` de P1 solo trae sus 3 complejos | 3 | 3 | ✅ |
| 7 | `metricas()` pidiendo un complejo de P2 | 0 reservas | 0 reservas | ✅ |
| 8 | P1 cambia el precio de una cancha de P2 | 0 filas | 0 filas | ✅ |
| 9 | P1 edita un complejo de P2 | 0 filas | 0 filas | ✅ |
| 10 | P1 cancela una reserva de P2 | 0 filas | 0 filas | ✅ |
| 11 | P1 elimina una cancha de P2 | 0 filas | 0 filas | ✅ |
| 12 | P1 crea una cancha en un complejo de P2 | error RLS | `42501` row-level security | ✅ |
| 13 | P1 bloquea un horario en una cancha de P2 | error RLS | `42501` row-level security | ✅ |
| 14 | P2 ve sus propias reservas (control) | > 0 | 735 | ✅ |
| 15 | P2 ve reservas de complejos de P1 | 0 | 0 | ✅ |
| 16 | `metricas()` de P2 solo trae sus 2 complejos | 2 | 2 | ✅ |
| 17 | P1 con solo contraseña (aal1) ve reservas | 0 | 0 | ✅ |
| 18 | P1 con solo contraseña (aal1) ve pagos | 0 | 0 | ✅ |
| 19 | Jugador ve reservas de otros jugadores | 0 | 0 | ✅ |
| 20 | Jugador lee el log de notificaciones | 0 | 0 | ✅ |
| 21 | Jugador crea una reserva "pagada" sin pagar | error RLS | `42501` row-level security | ✅ |
| 22 | Jugador se cambia el rol a admin | error permisos | `42501` permission denied | ✅ |
| 23 | Anónimo ve reservas | 0 | 0 | ✅ |
| 24 | Anónimo ve complejos activos (catálogo público) | > 0 | 5 | ✅ |

Las mismas reglas se comprobaron por la API REST con tokens reales: P1 con `aal1` recibe `[]` en `reservas` y 403 en `/reportes/export`; el usuario de pruebas con `aal2` no ve reservas de P1 y su export de un complejo ajeno da 404.

## 3. Casos de prueba funcionales (E2E por API, contra los servicios reales)

| ID | Caso | Pasos | Resultado esperado | Resultado |
|---|---|---|---|:-:|
| F01 | Catálogo público | GET complejos como anónimo | 5 complejos activos | ✅ |
| F02 | Disponibilidad | RPC `disponibilidad(cancha, fecha)` | Grilla con horas libres | ✅ 13/15 libres |
| F03 | Crear reserva | Jugador inserta reserva enviando `monto: 1` | 201 y monto recalculado | ✅ 120.00 |
| F04 | Doble reserva | Misma cancha y hora otra vez | Error `23P01` "Ese horario acaba de ser tomado" | ✅ |
| F05 | Iniciar pago | `POST /pagos/checkout` | URL de `checkout.stripe.com` | ✅ |
| F06 | Doble clic en Pagar | Segundo checkout | Reutiliza la misma sesión | ✅ |
| F07 | Pagar reserva ajena | Checkout con otro jugador | 403 | ✅ |
| F08 | Verificar sin pagar | `POST /pagos/verificar` | 402 | ✅ |
| F09 | Comprobante ajeno | Verificar sesión de otro | 403 | ✅ |
| F10 | Cancelar reserva | Jugador cancela con > 2 h | Estado `cancelada` | ✅ |
| F11 | Correo de confirmación | Envío real con Resend a la cuenta dueña | `enviado` en `notificaciones_log` | ✅ |
| F12 | Limpieza sin secreto | `POST /tareas/limpiar-pendientes` | 401 | ✅ |
| F13 | Limpieza programada | Con `X-Cron-Secret` | Cancela pendientes viejas, usa minutos de `configuracion` | ✅ |
| P01 | MFA en la base | Propietario con `aal1` por REST | 0 filas; export 403; perfil sí legible | ✅ |
| P02 | Registrar complejo | Propietario crea complejo | Queda `pendiente` | ✅ |
| P03 | Autoaprobarse | Propietario cambia `estado` a `activo` | 403 | ✅ |
| P04 | Editar cancha | Cambiar precio de una cancha propia | Actualizado | ✅ |
| P05 | Bloquear horario | Propietario crea bloqueo | 201, monto 0 | ✅ |
| P06 | Bloqueo por jugador | Jugador intenta `es_bloqueo` (pagada o pendiente) | 403 | ✅ |
| P07 | Métricas | `metricas()` del rango | Solo su complejo; bloqueo sin ingreso | ✅ |
| P08 | Exportar | CSV y PDF | 200; PDF válido (`%PDF`) | ✅ |
| P09 | Quitar bloqueo | Cancelar el bloqueo | `cancelada` | ✅ |
| A01 | Admin sin MFA | `/admin/resumen` con `aal1` | 403; no lee `configuracion` | ✅ |
| A02 | Propietario en /admin | `/admin/usuarios` | 403 | ✅ |
| A03 | Resumen global | `/admin/resumen` | Usuarios por rol, MFA, complejos, crecimiento | ✅ |
| A04 | Buscar y filtrar usuarios | `?q=` y `?rol=` | Resultados correctos | ✅ |
| A05 | Suspender | Suspender a `jugador@` y que intente entrar | Login rechazado (`banned`) | ✅ |
| A06 | Reactivar | Reactivar y volver a entrar | Login OK | ✅ |
| A07 | Cambiar rol | jugador → propietario → jugador | OK; admin no puede quitarse su rol (400) | ✅ |
| A08 | Aprobar solicitud | Jugador registra complejo; admin aprueba | Complejo `activo` y público; dueño pasa a `propietario` | ✅ |
| A09 | Suspender complejo | Admin suspende | Deja de ser público | ✅ |
| A10 | Configuración | Cambiar minutos; comisión 99 % | Guardado y auditado; 99 % rechazado (CHECK) | ✅ |
| A11 | Actividad | Admin lee notificaciones y pagos | OK | ✅ |
| R01 | Edge Function protegida | Sin header / secreto incorrecto | 401 / 401 | ✅ |
| R02 | Recordatorios dry run | `?dry_run=true` | 21 reservas de mañana, 0 enviados, sin registros | ✅ |
| R03 | Botón del admin | `POST /admin/recordatorios?dry_run=true` | 200 vía backend | ✅ |
| R04 | Cron → función | Misma llamada que pg_cron (Vault + pg_net) | HTTP 200 en `net._http_response` | ✅ |

Los pasos que modificaron datos se revirtieron en el mismo script (reservas canceladas, sesiones de Stripe expiradas, roles y suspensiones restaurados).
Estos scripts E2E no están en el repositorio: usan un usuario de pruebas (`qa.propietario@canchaya.demo`) cuyo secreto TOTP no debe versionarse. Para la sesión AAL2 generan el código TOTP (RFC 6238) igual que una app autenticadora.

## 4. Prueba de carga

**Herramienta**: `scripts/prueba_carga.py` (Python + `httpx` asíncrono; sin instalar k6/locust).
**Entorno**: backend local (uvicorn, 1 proceso, MacBook) y Supabase remoto (plan Free, São Paulo) desde Arequipa.
**Comando**: `backend/.venv/bin/python scripts/prueba_carga.py --api http://localhost:8001`

| Escenario | Peticiones | Concurrencia | req/s | p50 ms | p95 ms | p99 ms | máx ms | Códigos |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `GET /health` (backend local) | 2 000 | 50 | 311.7 | 98.3 | 483.8 | 916.1 | 1 770.9 | 200 × 2 000 |
| RPC `disponibilidad` (Supabase) | 300 | 10 | 40.0 | 212.5 | 484.6 | 763.8 | 1 023.4 | 200 × 300 |
| `GET /me` sin token × 150 (rate limit) | 150 | 5 | 1 587.6 | 2.3 | 6.1 | 13.1 | 30.5 | 401 × 100, **429 × 50** |

**Conclusiones**
- 0 errores en 2 300 peticiones reales. El backend con **un solo proceso** sostiene ~300 req/s en `/health`; con 50 usuarios simultáneos el p95 queda bajo 0,5 s.
- La RPC de disponibilidad (consulta con `generate_series` + `NOT EXISTS` sobre ~1 750 reservas, usando el índice `reservas_cancha_fecha_idx`) responde en ~210 ms de mediana, que es sobre todo la latencia de red a São Paulo.
- El **rate limit funciona**: a partir de la petición 101 en un minuto, la IP recibe 429.
- En producción (Render Free: 0,1 CPU) el rendimiento será menor y el **primer request tras dormir tarda ~30-60 s**; por eso UptimeRobot lo consulta cada 5 min. Para más carga: Render Starter/Standard y varias instancias (y mover el rate limit a Redis).

## 5. CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada push/PR a `main`: frontend (lint + build), backend (pytest) y docker (build + `/health`). Se simuló localmente el job de backend (pytest en una copia **sin `.env`**): 40/40 en ese momento, 43/43 tras agregar el rate limit.

## 6. Pendientes (requieren navegador)

- [ ] Pago con tarjeta `4242 4242 4242 4242` → `/pago/exito` → correo de confirmación recibido.
- [ ] Recordatorio real: reserva pagada para mañana con el correo de Resend → "Ejecutar recordatorios ahora".
- [ ] Configurar MFA de `admin@` y `propietario2@` con la app autenticadora.
- [ ] Revisión visual en escritorio y móvil de los paneles de propietario y admin, `/estado` y "Registrar mi complejo".
- [ ] Subir una foto de complejo (Storage).
- [ ] Tras el deploy: repetir F05 en producción (la URL de Stripe debe volver a Vercel), webhook de Stripe y cron de limpieza.
