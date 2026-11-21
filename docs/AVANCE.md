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
- `supabase/seed.sql`: 5 complejos en Lima (Surco, Miraflores, San Borja, Los Olivos, SJL) con 12 canchas.
- `scripts/crear_usuarios_demo.py`: crea `admin@`, `propietario1@`, `propietario2@` y `jugador@canchaya.demo` (contraseña `Demo1234!`), asigna roles y complejos y genera ~4 semanas de reservas (`seed_asociar_demo()`).

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
