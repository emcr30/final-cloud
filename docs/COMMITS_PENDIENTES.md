# Commits pendientes (para hacer a mano, uno por parte)

Claude no hace commits. Cada sección tiene el mensaje sugerido y los archivos exactos.
Hazlos **en este orden**, desde la raíz del repo (`final-cloud/`):

```bash
git add <archivos de la sección>
git commit -m "<mensaje>"
```

> `CLAUDE.md` aparece modificado en `git status`, pero es tuyo: no está en ninguna lista.
> Si un archivo aparece en dos secciones (p. ej. `docs/AVANCE.md`), se incluye completo en
> la **primera** en la que aparece; en las siguientes ya no tendrá cambios y `git add` no hace nada.
> Eso es normal (los cambios de varias partes al mismo archivo no se pueden separar sin `git add -p`).
> Consecuencia: los commits intermedios pueden no compilar solos (p. ej. el de la Parte 5 ya trae
> `App.tsx` y `main.py` que importan páginas y routers de partes siguientes). Haz **todos** los commits
> y luego **un solo `git push`**: GitHub Actions prueba el último commit, que sí está completo.
>
> Antes de empezar: `git status --short` debe mostrar exactamente los archivos de estas secciones
> (más `CLAUDE.md`). Al terminar, `git status --short` solo debe mostrar `CLAUDE.md`.

---

## Parte 5 — Pagos con Stripe y correo de confirmación

```bash
git add backend/.env.example backend/app/config.py backend/app/main.py \
  backend/app/routers/pagos.py backend/app/routers/tareas.py \
  backend/app/servicios/__init__.py backend/app/servicios/correo.py backend/app/servicios/pagos.py \
  backend/tests/test_pagos.py \
  frontend/src/App.tsx frontend/src/pages/pago/Exito.tsx frontend/src/pages/pago/Cancelado.tsx \
  docs/AVANCE.md docs/COMMITS_PENDIENTES.md
git commit -m "feat: pagos con Stripe Checkout, webhook, limpieza de pendientes y correo de confirmación con Resend (Parte 5)"
```

## Parte 6 — Panel del propietario y aislamiento multi-tenant

```bash
git add supabase/migrations/20261122000100_propietario_metricas.sql supabase/tests/aislamiento_multitenant.sql \
  backend/requirements.txt backend/app/main.py backend/app/routers/reportes.py backend/app/servicios/reportes.py \
  backend/tests/test_reportes.py \
  frontend/src/App.tsx frontend/src/lib/api.ts frontend/src/lib/panel.ts \
  frontend/src/components/Graficos.tsx frontend/src/components/FormComplejo.tsx frontend/src/components/SelectorUbicacion.tsx \
  frontend/src/pages/panel/Paneles.tsx \
  frontend/src/pages/propietario/Dashboard.tsx frontend/src/pages/propietario/Complejos.tsx \
  frontend/src/pages/propietario/Canchas.tsx frontend/src/pages/propietario/Agenda.tsx \
  docs/AVANCE.md docs/COMMITS_PENDIENTES.md
git commit -m "feat: panel del propietario (dashboard, complejos, canchas, agenda, export CSV/PDF), MFA en RLS y prueba de aislamiento multi-tenant (Parte 6)"
```

## Parte 7 — Panel del administrador

```bash
git add supabase/migrations/20261122000200_admin_configuracion.sql supabase/migrations/20261122000300_admin_usuarios.sql \
  backend/requirements.txt backend/app/main.py backend/app/routers/admin.py backend/app/servicios/pagos.py \
  backend/tests/test_admin.py \
  frontend/src/App.tsx frontend/src/components/Graficos.tsx frontend/src/components/PanelLayout.tsx \
  frontend/src/pages/panel/Paneles.tsx frontend/src/pages/auth/Registro.tsx \
  frontend/src/pages/admin/Dashboard.tsx frontend/src/pages/admin/Usuarios.tsx frontend/src/pages/admin/Complejos.tsx \
  frontend/src/pages/admin/Actividad.tsx frontend/src/pages/admin/Configuracion.tsx \
  frontend/src/pages/jugador/SolicitarComplejo.tsx \
  docs/AVANCE.md docs/COMMITS_PENDIENTES.md
git commit -m "feat: panel del administrador (usuarios, roles, suspensión, aprobación de complejos, actividad, configuración) y solicitud de complejo del jugador (Parte 7)"
```

## Parte 8 — Edge Function de recordatorios y pg_cron

```bash
git add supabase/functions/send-reminders/index.ts supabase/config.toml \
  supabase/migrations/20261122000400_cron_recordatorios.sql \
  supabase/pendientes/20261122000500_cron_limpieza_pendientes.sql \
  frontend/src/pages/admin/Actividad.tsx backend/app/routers/admin.py \
  docs/AVANCE.md docs/COMMITS_PENDIENTES.md
git commit -m "feat: Edge Function send-reminders con pg_cron diario (18:00 Lima), secretos en Vault y migración pendiente de limpieza (Parte 8)"
```

## Parte 9 — Archivos de despliegue, CI y página de estado

```bash
git add frontend/vercel.json render.yaml .github/workflows/ci.yml README.md \
  backend/app/routers/health.py backend/tests/test_health.py \
  frontend/src/App.tsx frontend/src/pages/Estado.tsx frontend/src/components/Layout.tsx \
  docs/PENDIENTES_EVELYN.md docs/AVANCE.md docs/COMMITS_PENDIENTES.md
git commit -m "chore: vercel.json, render.yaml, CI con GitHub Actions y página /estado (Parte 9)"
```

## Parte 10 — Pulido, seguridad y documentación (commit final)

```bash
git add backend/Dockerfile backend/app/limites.py backend/app/main.py backend/app/routers/health.py \
  backend/requirements.txt backend/tests/test_health.py \
  frontend/index.html frontend/vite.config.ts frontend/src/App.tsx \
  frontend/src/components/Layout.tsx frontend/src/components/PanelLayout.tsx \
  scripts/prueba_carga.py README.md \
  docs/arquitectura.md docs/modulos.md docs/seguridad.md docs/costos.md docs/pruebas.md docs/guion_demo.md \
  docs/AVANCE.md docs/PENDIENTES_EVELYN.md docs/RESUMEN_NOCHE.md docs/COMMITS_PENDIENTES.md
git commit -m "feat: rate limit y CORS estricto, carga diferida, títulos por página, prueba de carga y documentación final (Parte 10)"
```

### Tag de versión (después del último commit)

```bash
git tag -a v1.0 -m "CanchaYa v1.0 — entrega final de Cloud Computing"
git push origin main
git push origin v1.0
```

(Recomendado: crear el tag **después** del deploy y de verificar producción, para que `v1.0` sea lo que se mostró en la demo.)
