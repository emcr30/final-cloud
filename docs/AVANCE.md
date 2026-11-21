# Avance del proyecto CanchaYa

Registro de lo que se completa en cada parte y cómo probarlo.

<!--
Plantilla para cada parte:

## Parte N — Título (fecha)
**Hecho**
- …
**Cómo probar**
1. …
**Pendiente / notas**
- …
-->

## Parte 1 — Estructura del monorepo (19-nov-2026)

**Hecho**
- `frontend/`: Vite + React 19 + TypeScript, Tailwind CSS v4 (paleta `cesped-*` en `src/index.css`), React Router, `@supabase/supabase-js`, Recharts, react-leaflet + Leaflet, lucide-react.
  - `src/lib/supabase.ts`: cliente Supabase que lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y exporta `API_URL` (desde `VITE_API_URL`).
  - Layout base con navbar responsive (menú hamburguesa en móvil), pie de página, página de inicio provisional y página 404.
- `backend/`: FastAPI.
  - `app/config.py`: configuración con pydantic-settings (lee `.env`).
  - `app/deps.py`: cliente Supabase con service role y dependencia `get_usuario_actual` (valida el Bearer token con `supabase.auth.get_user` y lee el rol de `profiles`).
  - `app/routers/health.py`: `GET /health` con estado y hora de Lima.
  - CORS configurable con `FRONTEND_URL` (admite varios orígenes separados por coma).
  - `Dockerfile` (python:3.12-slim, usuario sin privilegios, uvicorn en `$PORT`) y prueba `tests/test_health.py`.
- `supabase/migrations/` y `supabase/functions/` (vacías por ahora).
- `.gitignore` en la raíz, `.env.example` documentados en `frontend/` y `backend/`, y `README.md` con el diagrama de arquitectura.

**Cómo probar**
1. Frontend: `cd frontend && npm install && npm run build` (debe compilar sin errores) y `npm run dev` → abrir http://localhost:5173.
2. Backend: `cd backend && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
   - `pytest`: 1 prueba en verde.
   - `uvicorn app.main:app --reload` → http://localhost:8000/health devuelve `{"estado":"ok", ...}`; la documentación interactiva está en http://localhost:8000/docs.

**Pendiente / notas**
- Docker no está instalado en la máquina de desarrollo, así que la imagen no se construyó en local. Se valida en GitHub Actions (Parte 9) y en Render.

## Parte 2 — Base de datos, RLS y datos de prueba (20-nov-2026)

**Hecho**
- `supabase/migrations/`:
  - `20261120000100_esquema.sql`: enums, tablas `profiles`, `complejos`, `canchas`, `reservas`, `pagos`, `notificaciones_log` con FKs, índices y CHECKs. Restricción `reservas_sin_solapamiento` (EXCLUDE con btree_gist, ignora canceladas) y trigger `validar_reserva`.
  - `20261120000200_auth_rls.sql`: trigger que crea el perfil `jugador` al registrarse, helpers `mi_rol()`, `es_propietario_de()` y afines (security definer), RLS en todas las tablas (19 políticas) y RPC `disponibilidad(cancha_id, fecha)`.
  - `20261120000300_vistas_storage.sql`: vistas `v_ingresos_diarios`, `v_ocupacion_cancha`, `v_reservas_por_estado`, `v_horas_pico` (security_invoker) y bucket `complejos` con sus políticas.
- `supabase/seed.sql`: 5 complejos en Arequipa (Yanahuara, Cayma, Sachaca, Bustamante y Rivero, Cerro Colorado) con 12 canchas (ver Parte 4.1).
- `scripts/crear_usuarios_demo.py`: crea `admin@`, `propietario1@`, `propietario2@` y `jugador@canchaya.demo` (contraseña `Demo1234!`), más un jugador con correo real (`echipanar@ulasalle.edu.pe`) para recibir los correos de Resend en la demo, asigna roles y complejos y genera ~4 semanas de reservas (`seed_asociar_demo()`).

**Cómo probar**
1. `supabase link --project-ref <ref>` y `supabase db push --remote --include-seed` (la contraseña de la BD por la variable `SUPABASE_DB_PASSWORD`, nunca en archivos).
2. `backend/.venv/bin/python scripts/crear_usuarios_demo.py`.
3. Verificado el 21-nov-2026 en el proyecto remoto: 6 tablas con RLS, 5 complejos con dueño, 12 canchas, 1741 reservas, 4 usuarios demo. Con la API pública: anónimo ve 5 complejos y 0 reservas; el jugador ve solo sus reservas; propietario1 solo reservas de sus complejos.

**Pendiente / notas**
- Requiere `supabase==2.28.3` (las versiones antiguas rechazan las llaves `sb_secret_`).

## Parte 3 — Autenticación, MFA y paneles por rol (20-nov-2026)

**Hecho**
- Frontend
  - `src/context/AuthContext.tsx`: sesión de Supabase, perfil (`profiles.rol`) y estado MFA (nivel AAL actual + si tiene factor TOTP verificado). Helpers `rutaPanel(rol)` y `pasoMfaPendiente()`.
  - Páginas públicas: `/login`, `/registro` (nombre, teléfono, email, contraseña → siempre `jugador`; nombre/teléfono van como metadata y el trigger los copia a `profiles`), `/recuperar` y `/nueva-password` (destino del enlace de recuperación).
  - MFA TOTP con `supabase.auth.mfa`: `/mfa/configurar` (enroll → QR + código secreto → verificar) y `/mfa/verificar` (challenge + verify tras la contraseña).
  - `RutaProtegida`: sin sesión → `/login`; **admin y propietario sin factor → `/mfa/configurar`** (obligatorio); cualquier usuario con factor y sesión `aal1` → `/mfa/verificar`; rol incorrecto → `/403`.
  - Rutas `/admin/*`, `/propietario/*`, `/jugador/*` con `PanelLayout` (sidebar distinta por rol; en móvil es una fila desplazable). Las secciones aún no hechas muestran "en construcción".
  - `/perfil`: editar nombre/teléfono, ver estado MFA y sesión (aal1/aal2), activar MFA (y desactivarlo solo si el rol no lo exige), cerrar sesión.
  - Página `/403`, navbar con "Mi panel"/"Salir" cuando hay sesión y landing completa (hero, cómo funciona, sección para complejos con "Registra tu complejo").
  - `src/lib/api.ts`: `api()` llama al backend con `Authorization: Bearer <token>`; `traducirError()` pasa los errores de Supabase Auth al español.
- Backend
  - `app/deps.py`: el `Usuario` ahora incluye `aal` (leído del claim del JWT, que ya fue validado con `auth.get_user`). Nuevas dependencias `require_role(*roles)` (si el rol es admin/propietario exige además AAL2) y `require_aal2`.
  - `GET /me` (cualquier usuario logueado) y `GET /me/admin` (solo admin con MFA). Los paneles tienen un botón "Probar backend" que los llama.
  - `tests/test_auth.py`: 6 pruebas (401 sin token, lectura del claim aal, rechazo por rol, MFA obligatorio para admin, jugador sin MFA, require_aal2).

**Cómo probar**
1. `cd backend && pytest` → 14 pruebas en verde. `cd frontend && npm run build && npm run lint` → sin errores.
2. Con la base migrada y los usuarios demo creados (Parte 2), `npm run dev` y `uvicorn app.main:app --reload`:
   - `jugador@canchaya.demo` / `Demo1234!` → entra directo a `/jugador`. "Probar backend: GET /me" devuelve `rol: jugador, aal: aal1`. Ir a `/admin` → página 403.
   - `propietario1@canchaya.demo` → la primera vez lo manda a `/mfa/configurar`: escanear el QR con Google Authenticator, ingresar el código → `/propietario`.
   - Cerrar sesión y volver a entrar con el propietario → pide el código en `/mfa/verificar`.
   - `admin@canchaya.demo` (con MFA) → `/admin`, "Probar backend: GET /me/admin" responde 200. Sin MFA el backend respondería 403.
   - Registro: crear una cuenta nueva en `/registro` → queda como `jugador`.
3. Para el enlace de recuperación de contraseña, agregar `http://localhost:5173/nueva-password` (y luego el dominio de Vercel) en Supabase → Authentication → URL Configuration → Redirect URLs.

**Pendiente / notas**
- Probado el 21-nov-2026 con la base remota: propietario1 configuró TOTP y `GET /me` devolvió `aal: aal2`.
- El control de rutas del frontend es solo UX: la seguridad real está en RLS y en `require_role` / `require_aal2` del backend.

## Parte 4 — Panel del jugador: buscar, mapa y reservar (21-nov-2026)

**Hecho**
- `/canchas` (pública, `pages/canchas/Buscar.tsx`): complejos activos con filtros (distrito, tipo de cancha, precio máximo), vista **Lista** o **Mapa** (react-leaflet + OpenStreetMap, sin API key) con popups (nombre, precio desde, "Ver canchas"). Botón **"Cerca de mí"** (Geolocation API): punto azul en el mapa, distancia en km en cada tarjeta y orden por cercanía con la fórmula de **Haversine** (`lib/canchas.ts → distanciaKm`).
- `/canchas/:complejoId` (`pages/canchas/Detalle.tsx`): foto (o fondo "césped" si no tiene), datos y mini mapa; elegir cancha, fecha (próximos 14 días) y de **1 a 3 horas seguidas** en la grilla de la RPC `disponibilidad()`. Resumen con total.
  - Sin sesión → manda a `/login` y luego regresa al complejo.
  - Crea la reserva `pendiente_pago` directamente en Supabase (RLS). El **monto lo calcula un trigger** en la base y la restricción **EXCLUDE** evita choques: si otra persona tomó la hora, se muestra "Ese horario acaba de ser tomado" (código Postgres `23P01`) y se refresca la grilla.
  - Luego llama a `POST /pagos/checkout` (Parte 5). Si el backend aún no lo tiene, avisa que la reserva quedó pendiente y que se puede pagar desde "Mis reservas".
- `/jugador/reservas` (`pages/jugador/Reservas.tsx`): pestañas Próximas / Historial (últimas 50), badges por estado, botón **Pagar** (pendientes) y **Cancelar** (solo si faltan más de 2 horas).
- `/jugador` (`pages/jugador/Inicio.tsx`): próxima reserva, total gastado, reservas del mes y en total.
- Migraciones nuevas:
  - `20261121000100_reglas_reservas_complejos.sql`: la regla de "cancelar con más de 2 horas" ahora también está en la **política RLS** (no solo en la UI). Trigger extra que impide a un no-admin cambiar `estado` o `propietario_id` de un complejo (segunda barrera; los permisos por columna ya lo impedían).
  - `20261121000200_resumen_jugador.sql`: función `resumen_jugador()` (security invoker) para los totales del panel; la API REST corta en 1000 filas y el jugador demo tiene ~1700 reservas.

**Cómo probar**
1. `cd frontend && npm run dev` → http://localhost:5173/canchas: filtrar, cambiar a Mapa, pulsar "Cerca de mí" (aceptar el permiso del navegador).
2. Entrar a un complejo, elegir cancha, mañana y 2 horas seguidas → "Reservar y pagar". Sin sesión pide login; con `jugador@canchaya.demo` crea la reserva y muestra el aviso de pago pendiente (el pago llega en la Parte 5).
3. Choque de horario: abrir el mismo complejo en dos pestañas, elegir la misma hora y reservar en ambas → la segunda muestra "Ese horario acaba de ser tomado".
4. `/jugador/reservas`: ver la reserva en Próximas y cancelarla.
5. Prueba automática ejecutada el 21-nov-2026 contra la base remota (todas OK): anónimo ve 5 complejos/12 canchas; disponibilidad devuelve la grilla; el monto enviado por el cliente (1) se recalculó a 240.00; la reserva duplicada da `23P01`; la hora reservada sale ocupada; cancelar con >2 h funciona; el propietario no puede cambiar el estado de su complejo (403). Las reservas de prueba se borraron.

**Pendiente / notas**
- La cancelación con menos de 2 horas no se pudo probar automáticamente (se corrió fuera del horario de atención); la regla está en la política RLS.
- Al cancelar una reserva pagada no hay reembolso automático (modo prueba); se anota para el informe.

## Parte 4.1 — Datos demo en Arequipa (21-nov-2026)

**Hecho**
- `supabase/seed.sql`: los 5 complejos de Lima se reemplazaron por complejos de **Arequipa** (mismos IDs, así el script de usuarios demo no cambia):
  - propietario1 → Yanahuara Fútbol Club (Yanahuara), Cayma Sport Center (Cayma), La Campiña de Sachaca (Sachaca).
  - propietario2 → Bustamante Arena (José Luis Bustamante y Rivero), Cerro Colorado Gol Center (Cerro Colorado).
  - Canchas con nombres locales: Misti, Chachani, Pichu Pichu, Sillar, Chili, Ampato, Estadio La Campiña…
- En la base remota se borraron los complejos de Lima (con sus canchas, reservas y pagos en cascada), se ejecutó el seed nuevo y `crear_usuarios_demo.py` (1741 reservas demo nuevas).
- El mapa ahora se centra en Arequipa (`CENTRO_MAPA`) y la landing/README dicen Arequipa. La zona horaria sigue siendo `America/Lima`, que es la hora oficial de todo el Perú.

**Cómo probar**
- http://localhost:5173/canchas → aparecen los 5 complejos de Arequipa en la lista y en el mapa.

**Notas**
- `supabase db push --include-seed` no vuelve a ejecutar un seed ya aplicado (solo actualiza su hash). Para recargarlo: `supabase db query --remote -f supabase/seed.sql`.

## Parte 5 — Pagos con Stripe y correo de confirmación (21-nov-2026)

**Hecho**
- Backend (`backend/app/`):
  - `servicios/pagos.py`: lógica de Stripe Checkout (modo prueba, **moneda PEN**: Stripe de prueba la acepta, verificado).
    - `crear_checkout()`: valida que la reserva sea del usuario y esté `pendiente_pago`, crea la sesión ("Reserva Cancha X - Complejo - fecha hora"), guarda `stripe_session_id` y devuelve la URL. Si el jugador pulsa "Pagar" otra vez, reutiliza la sesión abierta.
    - `confirmar_pago()`: **idempotente**. Un `UPDATE ... WHERE estado = 'pendiente_pago'` actúa de candado: solo la primera llamada (página de éxito o webhook) marca `pagada`, inserta en `pagos` (upsert por `stripe_session_id`) y envía el correo.
    - `limpiar_pendientes()`: cancela reservas pendientes con más de 15 min (`MINUTOS_EXPIRACION_PENDIENTE`). Antes **expira la sesión de Stripe** para que ya no se pueda pagar; si resulta que sí se pagó, confirma en vez de cancelar.
  - `servicios/correo.py`: correo HTML con Resend (datos de la reserva, dirección y enlace a Google Maps; textos escapados contra inyección de HTML). Todo envío se registra en `notificaciones_log` (`enviado` / `error` / `omitido`); si Resend falla, el pago no se cae.
  - `routers/pagos.py`: `POST /pagos/checkout`, `POST /pagos/verificar` (solo el dueño del pago o un admin), `POST /pagos/webhook` (verifica la firma `Stripe-Signature`; responde 503 si falta `STRIPE_WEBHOOK_SECRET`).
  - `routers/tareas.py`: `POST /tareas/limpiar-pendientes` protegido con el header `X-Cron-Secret` (comparación en tiempo constante). Lo programará pg_cron en la Parte 8.
  - `tests/test_pagos.py`: 9 pruebas nuevas (401 sin token, webhook sin secreto/firma falsa, X-Cron-Secret, céntimos, fecha en español, escape de HTML). Total: **23 pruebas en verde**.
- Frontend: `/pago/exito` (llama a `/pagos/verificar` y muestra el comprobante con "Cómo llegar" e "Imprimir") y `/pago/cancelado`. "Reservar y pagar" y "Pagar" en Mis reservas ya redirigen a Stripe.
- Usuario demo extra: `echipanar@ulasalle.edu.pe` (jugador) para recibir los correos de Resend.

**Cómo probar**
1. Backend: `cd backend && .venv/bin/uvicorn app.main:app --reload` (desde `final-cloud`, no desde `.claude/worktrees`). Frontend: `cd frontend && npm run dev`.
2. Entrar con `echipanar@ulasalle.edu.pe` / `Demo1234!` → `/canchas` → elegir complejo, cancha, fecha y hora → **Reservar y pagar**.
3. En Stripe usar la tarjeta de prueba **4242 4242 4242 4242**, cualquier fecha futura (ej. 12/34), cualquier CVC (ej. 123) y cualquier nombre.
4. Vuelve a `/pago/exito` con el comprobante; la reserva aparece **Pagada** en Mis reservas y llega el correo de confirmación.
5. Pago cancelado: en Stripe pulsar "←" → `/pago/cancelado`; la reserva queda pendiente y se puede pagar desde Mis reservas.
6. Limpieza manual: `curl -X POST http://localhost:8000/tareas/limpiar-pendientes -H "X-Cron-Secret: <CRON_SECRET>"`.
7. Prueba automática ejecutada el 21-nov-2026 contra Stripe y Supabase reales (todas OK): checkout devuelve URL de Stripe; segundo clic reutiliza la sesión; otro jugador → 403; verificar sin pagar → 402; verificar sesión ajena → 403; limpiar sin secreto → 401; limpiar con secreto cancela la reserva vieja y **expira la sesión de Stripe**.

**Pendiente / notas**
- El camino "pago aprobado → correo" requiere pagar en el navegador; queda para la prueba manual (paso 2-4).
- Webhook en local (opcional): `stripe listen --forward-to localhost:8000/pagos/webhook` y copiar el `whsec_...` que muestra a `STRIPE_WEBHOOK_SECRET`. En producción se configura en la Parte 9.
- Resend sin dominio propio solo entrega al correo dueño de la cuenta de Resend.
- Cancelar una reserva pagada no genera reembolso automático (modo prueba).

## Verificación de las Partes 4 y 5 (21-nov-2026, noche)

**Hecho**
- `scripts/crear_usuarios_demo.py` ejecutado: 5 usuarios demo actualizados, incluido `echipanar@ulasalle.edu.pe` (jugador, `Demo1234!`).
- `npm run build`, `npm run lint` (0 avisos) y `pytest` (23 pruebas) en verde.
- Prueba E2E por API contra Supabase y Stripe reales (todas OK): `/health`; `/me` del jugador; anónimo ve 5 complejos; disponibilidad; crear reserva (monto 1 → recalculado a 120.00); duplicada → `23P01`; `POST /pagos/checkout` devuelve URL de `checkout.stripe.com`; segundo clic reutiliza la sesión; otro jugador → 403; verificar sin pagar → 402; verificar sesión ajena → 403; sin token → 401; limpiar sin secreto → 401; cancelar la reserva; la sesión de Stripe se expiró al final.
- **Correo real con Resend**: se envió el correo de confirmación a `echipanar@ulasalle.edu.pe` (estado `enviado` en `notificaciones_log`, id de Resend `01a1fcaf-…`). Fue una prueba directa del servicio `correo.enviar_confirmacion`; el camino completo "pagar con tarjeta 4242 → correo" requiere el navegador (ver `docs/PENDIENTES_EVELYN.md`).

**Notas**
- No faltaba nada para completar las Partes 4 y 5.

## Parte 6 — Panel del propietario y aislamiento multi-tenant (21-nov-2026)

**Hecho**
- Migración `20261122000100_propietario_metricas.sql` (aplicada en remoto con `supabase db push`):
  - **MFA también en la base**: política `RESTRICTIVE` en `complejos`, `canchas`, `reservas`, `pagos` y `notificaciones_log` con `public.mfa_ok()`: si tu rol es admin o propietario, tu JWT debe tener `aal = aal2`. Quien robe solo la contraseña de un propietario no puede leer su agenda llamando a la API REST. `profiles` queda fuera para que la app pueda leer el rol y mandarlo a `/mfa/verificar`.
  - **Bloqueos de horario**: columna `reservas.es_bloqueo`. Nueva política: el propietario inserta en SUS canchas una reserva `pagada` + `es_bloqueo` a su nombre; el trigger le pone monto 0. El jugador ya no puede crear reservas con `es_bloqueo` (si no, reservaría gratis). `v_ingresos_diarios` excluye bloqueos.
  - **`metricas(desde, hasta, complejo)`** (security invoker → RLS filtra): resumen (ingresos, reservas, ocupación %, canceladas, bloqueos), ingresos diarios (con días en cero), ocupación por cancha, horas pico (día × hora) y totales por complejo. Se calcula en Postgres por el límite de 1000 filas de la API.
- Backend: `GET /reportes/export?formato=csv|pdf&desde&hasta[&complejo_id]` (`routers/reportes.py`, `servicios/reportes.py`, reportlab). `require_role("propietario","admin")` (exige AAL2). Como usa la service role, filtra explícitamente por `propietario_id` (el admin ve todo); pagina de 1000 en 1000; CSV con BOM para Excel. `tests/test_reportes.py`: 8 pruebas (401, 403 jugador, propietario no ve datos de otro, complejo ajeno → 404, PDF, rango inválido, bloqueos no son ingreso). **31 pruebas en verde.**
- Frontend (`/propietario/*`):
  - **Dashboard** (`pages/propietario/Dashboard.tsx`): filtros en una fila (complejo + rango con atajos 7/30 días, este mes, 90 días), KPIs, ingresos por día (barras, tooltip), ocupación por cancha (barras horizontales) y **heatmap de horas pico** (grilla CSS en escala de verde). Botones **CSV** y **PDF**. Componentes reutilizables en `components/Graficos.tsx` (los usa también el admin).
  - **Mis complejos** (`pages/propietario/Complejos.tsx`): tarjetas con estado; crear/editar con `components/FormComplejo.tsx` (horario, distrito con sugerencias de Arequipa, **ubicación con clic en el mapa** → `components/SelectorUbicacion.tsx`, **foto a Supabase Storage** bucket `complejos`). Los nuevos quedan `pendiente`.
  - **Canchas** (`pages/propietario/Canchas.tsx`): agregar, editar, activar/desactivar; eliminar solo si nunca tuvo reservas (si no, se sugiere desactivar, para no borrar historial).
  - **Agenda** (`pages/propietario/Agenda.tsx`): semana × horas por cancha, colores por estado con leyenda; clic en reserva → datos del cliente (nombre, teléfono), "Marcar completada" / "Cancelar"; clic en hora libre → "Bloquear este horario".
- **Prueba de aislamiento multi-tenant**: `supabase/tests/aislamiento_multitenant.sql` (simula el JWT de cada usuario dentro de una transacción con `ROLLBACK`, no cambia datos). **24/24 OK**:
  - P1 ve sus reservas (1008) pero 0 de P2; 0 pagos y 0 ingresos de P2; `metricas()` le devuelve solo sus 3 complejos y 0 si pide uno de P2.
  - P1 intenta cambiar precio, editar complejo, cancelar reserva y borrar cancha de P2 → 0 filas; crear cancha o bloqueo en complejo de P2 → error RLS `42501`.
  - P2 ve sus 735 reservas y 0 de P1; `metricas()` solo sus 2 complejos.
  - P1 con solo contraseña (aal1) → 0 reservas y 0 pagos (MFA en RLS).
  - Jugador: 0 reservas ajenas, 0 notificaciones, no puede crear una reserva "pagada" ni cambiarse el rol (`permission denied`). Anónimo: 0 reservas, sí ve el catálogo.
- Prueba E2E por API (19/19 OK) con un usuario de pruebas propio `qa.propietario@canchaya.demo` (TOTP generado por el script, para tener sesión AAL2 sin tocar los factores de los usuarios demo): P1 con aal1 recibe 0 filas y 403 en el export; QA crea complejo (queda pendiente), no puede autoaprobarse ni crearlo activo, edita su cancha, bloquea un horario (monto 0), el jugador no puede crear bloqueos, métricas y export CSV/PDF funcionan, export de complejo ajeno → 404.
- Con datos reales (P1, últimos 30 días, simulando su JWT aal2): 886 reservas, S/ 99 350, ocupación 28,1 %.

**Cómo probar**
1. `supabase db query --remote --yes -f supabase/tests/aislamiento_multitenant.sql` → todas las filas con `ok = true`.
2. `cd backend && .venv/bin/pytest` → 31 pruebas.
3. En el navegador con `propietario1@canchaya.demo` (MFA): Dashboard → cambiar rango/complejo, descargar CSV y PDF. Mis complejos → "Nuevo complejo" (clic en el mapa, subir foto) → queda "Pendiente de aprobación"; editar canchas. Agenda → bloquear una hora libre, ver una reserva y marcarla completada.

**Notas**
- `propietario2@canchaya.demo` aún no tiene MFA: la primera vez que entre le pedirá configurarlo.
- Usuario de pruebas `qa.propietario@canchaya.demo` con su "Complejo de prueba QA (se puede borrar)" en estado pendiente: sirve para probar la aprobación en el panel admin. Ver `docs/PENDIENTES_EVELYN.md`.

## Parte 7 — Panel del administrador (21-nov-2026)

**Hecho**
- Migraciones (aplicadas en remoto):
  - `20261122000200_admin_configuracion.sql`: tabla `configuracion` (una sola fila): `comision_pct` (0-50 %, CHECK) y `minutos_expiracion` (5-120). Solo el admin con MFA la lee/cambia (RLS + política MFA). Trigger que guarda `updated_at` y `updated_by`.
  - `20261122000300_admin_usuarios.sql`: `admin_listar_usuarios()` (solo service role) une `auth.users` + `profiles` + `auth.mfa_factors` (email, rol, último ingreso, ban, MFA) en una consulta.
- Backend `routers/admin.py` (todo con `require_role("admin")` → exige AAL2): `GET /admin/resumen`, `GET /admin/usuarios?q=&rol=`, `PATCH /admin/usuarios/{id}/rol`, `POST /admin/usuarios/{id}/suspension` (ban de Supabase Auth), `GET /admin/complejos`, `PATCH /admin/complejos/{id}/estado` (aprobar → activo y el dueño pasa de jugador a propietario), `POST /admin/recordatorios?dry_run=` (llama a la Edge Function de la Parte 8). El admin no puede quitarse su rol ni suspenderse.
- `limpiar_pendientes()` ahora lee los minutos de `configuracion` (si falla, usa `MINUTOS_EXPIRACION_PENDIENTE`). `httpx` pasó a dependencia de producción.
- `tests/test_admin.py`: 8 pruebas (401, propietario 403, admin sin MFA 403, no quitarse el rol, no suspenderse, rol inválido 422, ban vigente, crecimiento semanal). **39 pruebas en verde.**
- Frontend `/admin/*`:
  - **Dashboard**: rango de fechas; KPIs (usuarios por rol, complejos activos/pendientes/suspendidos, usuarios con MFA, reservas y ocupación global, ingresos de complejos, **comisión simulada** con el % de `configuracion`); ingresos por día; top complejos; nuevos usuarios por semana; mapa con todos los complejos.
  - **Usuarios**: búsqueda (con retardo de 300 ms), filtro por rol, cambiar rol, suspender/reactivar, MFA activo sí/no, registro y último ingreso.
  - **Complejos**: pestañas Pendientes/Activos/Suspendidos/Todos; Aprobar, Rechazar, Suspender, Reactivar.
  - **Actividad**: últimas 30 notificaciones y 30 pagos (los del seed se marcan "dato demo") y botones de recordatorios (Parte 8).
  - **Configuración**: comisión y minutos de expiración.
- Jugador: **"Registrar mi complejo"** (`/jugador/solicitar-complejo`) = "solicitar ser propietario": formulario con mapa (sin foto: Storage solo deja subir a propietarios) y estado de sus solicitudes. El botón "Registra tu complejo" de la landing (`/registro?complejo=1`) ahora lleva ahí tras crear la cuenta.
- Prueba E2E por API (26/26 OK) usando el usuario QA subido temporalmente a admin (con su TOTP) y un segundo usuario `qa.jugador@canchaya.demo`: admin sin MFA → 403 y no lee `configuracion`; resumen; búsqueda y filtro; suspender `jugador@` → no puede iniciar sesión ("banned") → reactivar → vuelve a entrar; cambio de rol ida y vuelta; solicitud de `qa.jugador` → aprobar → complejo público y dueño a propietario → suspender → deja de ser público; configuración (auditada; 99 % rechazado por CHECK; el jugador no puede cambiarla); la limpieza usó los minutos de la configuración; el admin lee notificaciones y pagos. Todo se dejó como estaba (QA de vuelta a propietario, `qa.jugador` a jugador, expiración en 15 min).

**Cómo probar**
1. `cd backend && .venv/bin/pytest` → 39 pruebas.
2. Entrar con `admin@canchaya.demo` (la primera vez configura MFA) → Dashboard, Usuarios (suspender y reactivar a `jugador@`), Complejos → pestaña Pendientes → aprobar el "Complejo de prueba QA", Configuración.
3. Flujo completo de "solicitar ser propietario": registrar una cuenta nueva → "Registrar mi complejo" → como admin aprobarlo → al volver a entrar, ese usuario va a `/mfa/configurar` y luego a `/propietario`.

**Notas**
- Durante la prueba, la limpieza canceló una reserva tuya pendiente sin pagar (23-nov 09:00, creada a las 00:43), que es el comportamiento esperado.
- El cambio de rol se aplica al instante en el backend (lee `profiles` en cada petición); en el navegador del usuario afectado, al recargar.

## Parte 8 — Automatización: Edge Function + pg_cron (21-nov-2026)

**Hecho**
- `supabase/functions/send-reminders/index.ts` (Deno + TypeScript), **desplegada**:
  - Busca reservas `pagada` (sin bloqueos) de **mañana en hora de Lima** con `recordatorio_enviado = false`; obtiene el email del jugador (`auth.admin.getUserById`) y envía con Resend un correo HTML con botón "Cómo llegar" (Google Maps con lat/lng del complejo). Marca `recordatorio_enviado` solo si se envió y registra cada intento en `notificaciones_log` (`enviado` / `error` / `omitido`).
  - `?dry_run=true`: devuelve la lista de lo que enviaría, sin enviar, sin marcar y sin registrar.
  - Protegida con `Authorization: Bearer <CRON_SECRET>` (comparación en tiempo constante); se despliega con `verify_jwt = false` (en `supabase/config.toml`) porque no se llama con un JWT de usuario.
  - Los correos `@canchaya.demo` no tienen buzón: se registran como `omitido` sin llamar a Resend. Pausa de 600 ms entre envíos (límite del plan gratis de Resend).
- Secrets de la función cargados con `supabase secrets set` desde `backend/.env`: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase).
- **Supabase Vault**: `canchaya_project_url` y `canchaya_cron_secret` (cargados con un SQL de una sola vez, fuera del repositorio).
- Migración `20261122000400_cron_recordatorios.sql` (**aplicada**): activa `pg_cron` y `pg_net` y programa `canchaya-recordatorios` con `0 23 * * *` (23:00 UTC = **18:00 Lima**), que hace `net.http_post` a la función leyendo URL y secreto de Vault.
- `supabase/pendientes/20261122000500_cron_limpieza_pendientes.sql` (**NO aplicada**): programa `POST /tareas/limpiar-pendientes` cada 15 min con `X-Cron-Secret`. Tiene el placeholder `<URL_DE_RENDER>` y una guarda que aborta si no se reemplazó. Está fuera de `migrations/` para que un `supabase db push` no la aplique antes de tiempo.
- Panel admin → Actividad: botones **"Simular (dry run)"** y **"Ejecutar recordatorios ahora"** (backend `POST /admin/recordatorios`, que llama a la función con el secreto; el navegador nunca lo ve).
- Pruebas (todas OK): sin header → 401; secreto incorrecto → 401; `dry_run` → 200, fecha 2026-11-22, 21 reservas encontradas, 0 enviados, nada en `notificaciones_log`; botón del admin vía backend → 200; **llamada desde la base** con la misma consulta del cron (Vault + pg_net) → `net._http_response` 200. No se hizo una ejecución real (solo `dry_run`, como se pidió).

**Comandos exactos**
```bash
# Desplegar (o redesplegar) la función
supabase functions deploy send-reminders --no-verify-jwt

# Secrets (los valores salen de backend/.env; no se escriben a mano en la terminal)
supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="CanchaYa <onboarding@resend.dev>" CRON_SECRET=...
supabase secrets list

# Invocar a mano (demo): simulación y ejecución real
export CRON_SECRET=$(grep '^CRON_SECRET=' backend/.env | cut -d= -f2-)
curl -s -X POST "https://tvefiatclvdseztwopyr.supabase.co/functions/v1/send-reminders?dry_run=true" -H "Authorization: Bearer $CRON_SECRET"
curl -s -X POST "https://tvefiatclvdseztwopyr.supabase.co/functions/v1/send-reminders" -H "Authorization: Bearer $CRON_SECRET"

# Ver el cron y sus últimas ejecuciones
supabase db query --remote --read-only "select jobname, schedule, active from cron.job"
supabase db query --remote --read-only "select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 5"

# Limpieza de pendientes a mano (mientras no esté el cron de 15 min)
curl -s -X POST http://localhost:8000/tareas/limpiar-pendientes -H "X-Cron-Secret: $CRON_SECRET"
curl -s -X POST https://<URL_DE_RENDER>/tareas/limpiar-pendientes -H "X-Cron-Secret: $CRON_SECRET"   # en producción
```

**Cómo probar en la demo**
1. Panel admin → Actividad → "Simular (dry run)": lista las reservas pagadas de mañana y a quién se enviaría.
2. Para recibir un recordatorio real: con `echipanar@ulasalle.edu.pe` reserva y paga (tarjeta 4242) una cancha para **mañana**; luego "Ejecutar recordatorios ahora" → llega el correo y aparece `enviado` en "Últimas notificaciones".

**Notas**
- Hoy (21-nov) a las 18:00 Lima el cron ya se ejecutará de verdad: las reservas demo de mañana son de `jugador@canchaya.demo`, así que se registrarán como `omitido` (sin enviar).

## Parte 9 — Despliegue, CI/CD y monitoreo: archivos (21-nov-2026)

**Hecho** (solo archivos; **no se desplegó nada**)
- `frontend/vercel.json`: framework Vite, build `npm run build`, salida `dist`, **rewrite de SPA** a `index.html` (así `/canchas/123` no da 404 al recargar), cabeceras de seguridad (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) y caché larga para `/assets/*`.
- `render.yaml` (Blueprint): Web Service **Docker** `canchaya-api`, plan free, región virginia, `rootDir: backend`, `dockerfilePath: ./backend/Dockerfile` (Render los toma relativos a la raíz del repo), `healthCheckPath: /health`, autodeploy, variables no secretas con valor y las secretas con `sync: false`.
- `.github/workflows/ci.yml`: en push/PR a `main` → **frontend** (Node 22, `npm ci`, lint, build con variables de relleno), **backend** (Python 3.12, `pytest`), **docker** (build de la imagen y prueba de que arranca y responde `/health`). Badge en el README.
- Backend: `GET /health/servicios` → qué integraciones están configuradas (`supabase` se prueba de verdad; Stripe, webhook, Resend y cron solo sí/no, nunca el valor). Prueba nueva → **40 pruebas**.
- Frontend: página pública **`/estado`** (enlace en el pie de página): semáforo de Backend (Render), Base de datos, Auth y la integración del backend, con latencia en ms; verde / amarillo (> 1,5 s, p. ej. Render despertando) / rojo; se refresca cada 30 s.
- `docs/PENDIENTES_EVELYN.md`: checklist paso a paso para Render, Vercel, Supabase Auth, Stripe webhook y UptimeRobot, y qué pedirme después.

**Cómo probar**
1. Local: http://localhost:5173/estado con el backend levantado → 4 en verde (en local sale "sin configurar: stripe_webhook", es normal).
2. CI simulado: `pytest` en una copia del backend **sin `.env`** → 40 pruebas en verde (así corre en GitHub Actions).
3. Tras el deploy: seguir `docs/PENDIENTES_EVELYN.md`.

**Notas**
- Docker no está instalado en esta máquina: la imagen se construye y prueba en el job `docker` de GitHub Actions y en Render.

## Parte 10 — Pulido, seguridad y documentación (21-nov-2026)

**Hecho**
- Seguridad del backend:
  - **Rate limit** con slowapi (`app/limites.py`): 100 peticiones/min por IP y por ruta → 429 en español; `/health` exento. Dockerfile con `--proxy-headers` para contar por la IP real detrás de Render.
  - **CORS más estricto**: solo `FRONTEND_URL`, métodos `GET/POST/PATCH/OPTIONS`, cabeceras `Authorization, Content-Type`, sin cookies.
  - 3 pruebas nuevas (429, `/health` exento, CORS con origen ajeno) → **43 pruebas**.
  - Revisión de secretos: ningún archivo versionable contiene llaves ni el `CRON_SECRET`; ningún `.env` en git.
  - Listado real de políticas: **7 tablas con RLS, 24 políticas** (en `docs/seguridad.md`).
- Frontend:
  - **Carga diferida** (React.lazy) de mapa, gráficos y paneles: el paquete inicial bajó de 710 kB a 543 kB; Leaflet (161 kB) y Recharts (420 kB) se descargan solo al abrir esas páginas. `Suspense` en el layout y en el panel (el menú lateral no parpadea).
  - **Título por página** en la pestaña del navegador (`Mis reservas · CanchaYa`, etc.).
  - Descripción del sitio corregida (Arequipa). Los estados de carga y vacíos ya existían en todas las páginas nuevas (spinner + mensajes "Aún no…").
- `scripts/prueba_carga.py`: prueba de carga sin instalar nada extra (httpx asíncrono). Resultados con el backend local: `/health` 2000 peticiones / 50 concurrentes → **312 req/s, p95 484 ms, 0 errores**; RPC `disponibilidad` 300 / 10 → 40 req/s, p95 485 ms, 0 errores; rate limit → 100 × 401 y 50 × 429.
- Documentos en `docs/`: `arquitectura.md` (5 diagramas Mermaid), `modulos.md`, `seguridad.md`, `costos.md`, `pruebas.md`, `guion_demo.md`. README con badge de CI, estructura actualizada y tabla de documentos.

**Cómo probar**
1. `cd frontend && npm run lint && npm run build` → sin errores ni avisos.
2. `cd backend && .venv/bin/pytest` → 43 pruebas.
3. Con el backend corriendo: `backend/.venv/bin/python scripts/prueba_carga.py --api http://localhost:8000`.
4. Abrir los `.md` de `docs/` en GitHub (renderiza los diagramas Mermaid).

**Pendiente / notas**
- No se hicieron "toasts" flotantes: la app usa avisos en línea (`Alerta`) de forma consistente en todas las acciones, que se leen mejor en la exposición. Tampoco skeletons: se mantuvo el spinner `Cargando`.
- Los precios de `docs/costos.md` son referenciales: confirmarlos antes de entregar.
- Los diagramas Mermaid no se pudieron renderizar aquí para revisarlos: revisarlos en GitHub.

---

## Rediseño visual del frontend

**Qué se hizo** (solo frontend; sin tocar base de datos, backend ni la lógica de las páginas)
- **Sistema visual nuevo** en `frontend/src/index.css`: tipografía Instrument Sans + DM Mono (horas, precios y etiquetas), grises neutros, tinta `#232323`, verde bosque `#1d6b3b` para acciones y verde menta `#a1ffcb` como acento. Los nombres de clase (`cesped-*`, `gray-*`) no cambiaron, así que todas las páginas toman la paleta nueva.
- **Fotos reales** de canchas en `frontend/public/img/` (optimizadas a JPG, de 1,9 MB a ~0,7 MB en total; a `cesped.jpg` se le recortó el logo de un club que aparecía en la foto original). Las originales siguen en `img/`.
- **Portada** (`pages/Inicio.tsx`): foto nocturna a pantalla completa con la barra de navegación transparente encima, pasos numerados junto a una foto, una frase grande sobre fondo oscuro, sección para dueños con la vista aérea y un cierre con llamada a la acción.
- **Barra de navegación y pie** rediseñados; menú móvil con botones de 44 px.
- **Login, registro, recuperar contraseña y MFA**: formulario a la izquierda y una foto a la derecha (en escritorio).
- **Buscar**: tarjetas con foto 4:3, precio "desde" en mono y efecto al pasar el mouse (la tarjeta sube 2 px y la foto hace un zoom leve). Los complejos sin foto usan una de las fotos de respaldo, siempre la misma para cada nombre (`FotoComplejo.tsx`).
- **Detalle/reserva**: pasos 01-02-03, horas en mono, horario elegido en menta.
- **Paneles**: menú lateral con avatar e ítem activo oscuro, KPIs con números en mono, gráficos con el verde nuevo. Botones en forma de píldora en toda la app.
- Animación de entrada en la portada, "presión" al hacer clic en los botones y respeto a `prefers-reduced-motion`.

**Cómo probar**
1. `cd frontend && npm run lint && npm run build` → sin errores.
2. `npm run dev` y revisar `/`, `/canchas`, el detalle de un complejo, `/login`, y un panel de cada rol. Revisar también a 390 px de ancho (móvil).

---

## Jugadores demo con nombres de Los Juegos del Hambre

**Qué se hizo**
- `jugador@canchaya.demo` ahora se llama **Katniss Everdeen** (antes "Juan Jugador"); misma contraseña.
- 9 jugadores demo nuevos, sin buzón real (contraseña `Demo1234!`): `peeta@`, `gale@`, `prim@`, `haymitch@`, `effie@`, `finnick@`, `johanna@`, `rue@`, `beetee@` (todos `@canchaya.demo`).
- Las 1741 reservas de prueba se repartieron al azar entre los 10 jugadores demo (≈150-195 cada uno). No se tocaron las reservas reales de `echipanar@ulasalle.edu.pe`, las de los usuarios QA ni los bloqueos de los propietarios.
- `scripts/crear_usuarios_demo.py` y `seed_asociar_demo()` en `supabase/seed.sql` quedaron actualizados para que una instalación nueva ya reparta las reservas entre todos los jugadores demo.

**Cómo probar**
- Entrar como `propietario1@canchaya.demo` → Agenda: las reservas muestran nombres variados (Peeta Mellark, Rue, Effie Trinket…).

---

## Agenda con bloques de varias horas y datos demo hasta el 5-dic

**Agenda (`frontend/src/pages/propietario/Agenda.tsx`)**
- Una reserva de 2 o 3 horas se dibuja como **un solo bloque** que ocupa todas sus filas (`rowSpan`), con el nombre y el rango (`Maysilee · 18:00–20:00`). Ya no aparece "↳". Clic en el bloque → detalle de la reserva.

**Datos demo (insertados directamente en Supabase, sin scripts)**
- 14 jugadores con nombres de *Amanecer en la cosecha* (`@canchaya.demo`, contraseña `Demo1234!`): se reutilizaron `haymitch@`, `effie@`, `beetee@` y se crearon `maysilee@`, `lenore@`, `louella@`, `wyatt@`, `ampert@`, `wiress@`, `mags@`, `burdock@`, `asterid@`, `plutarch@`, `drusilla@`.
- Se reemplazaron las reservas de prueba de jugadores demo desde el **7-nov** (hoy − 14 días) por reservas nuevas hasta el **5-dic**: 5-6 por semana en cada cancha activa (23-27 por cancha en total), 77 % de noche (18:00-22:00) y más en fin de semana, ~1 de cada 3 de 2 horas.
- Pasadas = `completada` con pago; futuras = `pagada` con pago (IDs de Stripe ficticios `cs_test_demo_…`). 8 bloqueos internos (máximo uno por cancha).
- **5-dic de 10:00 a 17:00 libre** en todas las canchas para reservar en vivo.
- No se tocaron: reservas de `echipanar@ulasalle.edu.pe`, la reserva de `propietario1`, los bloqueos existentes, los usuarios QA ni el historial anterior al 7-nov.
- Recordatorios: `send-reminders` ya registra como `omitido` (sin enviar) a todo destinatario `*.demo`.

**Cifras esperadas en los dashboards (7-nov a 5-dic)**: propietario1 176 reservas / S/ 25 650; propietario2 124 / S/ 12 265; admin 300 / S/ 37 915. Horas pico 18:00-21:00.

**Cómo probar**
1. Entrar como `propietario1@canchaya.demo` (con código MFA) → Agenda → recorrer semanas hasta el 5-dic; las reservas de 2 h se ven como un bloque.
2. Dashboard del propietario y del admin con rango 7-nov a 5-dic.
3. Como jugador, abrir cualquier complejo el sábado 5-dic: de 10:00 a 17:00 todo libre.
