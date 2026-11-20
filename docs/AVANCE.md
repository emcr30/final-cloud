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
