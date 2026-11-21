# Pendientes de Evelyn

Lo que depende de ti (cuentas, dashboards, navegador o decisiones). Hazlo en este orden.
Claude no despliega ni hace commits: todo lo de abajo es manual.

---

## 0. Commits y push

1. Revisa `git status` y haz los commits **en orden**, uno por parte, con los comandos de `docs/COMMITS_PENDIENTES.md`.
2. `git push origin main`.
3. En GitHub → pestaña **Actions**: el workflow **CI** debe salir en verde (frontend, backend y Docker). El badge del README lo refleja.

---

## 1. Render (backend) — primero, porque Vercel necesita su URL

1. Render → **New → Blueprint** → elige el repo `emcr30/final-cloud`. Render lee `render.yaml` y propone el servicio **canchaya-api** (Docker, plan free, región Virginia, health check `/health`).
2. Te pedirá las variables marcadas `sync: false`. Copia los valores de tu `backend/.env`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`
   - `CRON_SECRET` → **el mismo** que en `backend/.env` (ya está en la Edge Function y en Vault; si lo cambias, hay que cambiarlo en los tres lugares).
   - `STRIPE_WEBHOOK_SECRET` → déjalo vacío por ahora (paso 4).
   - `FRONTEND_URL` → por ahora `http://localhost:5173` (lo cambias en el paso 2.4).
3. **Apply**. Espera el build (5-8 min la primera vez). Anota la URL, p. ej. `https://canchaya-api.onrender.com`.
4. Comprueba: abre `https://<render>/health` → `{"estado":"ok", "entorno":"production", ...}` y `https://<render>/docs`.

## 2. Vercel (frontend)

1. Vercel → **Add New → Project** → importa `emcr30/final-cloud`.
2. **Root Directory: `frontend`**. Framework: **Vite** (lo detecta; `vercel.json` ya tiene build, salida `dist` y el rewrite de la SPA).
3. Environment Variables (Production y Preview), copiando de `frontend/.env`:
   - `VITE_SUPABASE_URL` = `https://tvefiatclvdseztwopyr.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = tu `sb_publishable_...`
   - `VITE_API_URL` = la URL de Render del paso 1 (sin `/` al final)
4. **Deploy**. Anota la URL, p. ej. `https://canchaya.vercel.app`.
5. Vuelve a **Render → canchaya-api → Environment** y cambia `FRONTEND_URL` a
   `https://<tu-app>.vercel.app,http://localhost:5173`
   (la de Vercel **primero**: el backend la usa para las redirecciones de Stripe; la segunda permite seguir probando en local). Guarda → Render redespliega.

## 3. Supabase Auth (URLs)

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://<tu-app>.vercel.app`
- **Redirect URLs** (agregar): `https://<tu-app>.vercel.app/**` y `http://localhost:5173/**`

(Sin esto, el enlace de "recuperar contraseña" y la confirmación de correo apuntan a localhost.)

## 4. Stripe webhook

1. Stripe (modo prueba) → **Developers → Webhooks → Add endpoint**.
2. URL: `https://<render>/pagos/webhook`. Evento: **`checkout.session.completed`**.
3. Copia el **Signing secret** (`whsec_...`) → Render → Environment → `STRIPE_WEBHOOK_SECRET` → guardar (redespliega).
4. (Opcional) "Send test webhook": el backend debe responder 200 (o 400 si es un evento de prueba sin firma válida; lo importante es que no sea 503).

## 5. UptimeRobot

1. UptimeRobot → **Add New Monitor** → tipo **HTTP(s)**.
2. URL: `https://<render>/health`. Intervalo: **5 minutos**. Alerta a tu correo.
3. Así Render (plan gratis, se duerme tras 15 min sin tráfico) se mantiene despierto y tienes historial de disponibilidad para el informe (captura del dashboard).

## 6. Pídeme después del deploy

Cuando tengas las dos URLs, escríbeme algo como:

> "Ya desplegué. Vercel: https://… Render: https://… Verifica producción y aplica la migración de limpieza."

Con eso yo:
1. Pruebo producción: `/health` y `/health/servicios` de Render, CORS desde Vercel, `/estado`, flujo de reserva → `POST /pagos/checkout` (la URL de Stripe debe volver a Vercel), webhook configurado, reportes y endpoints admin.
2. Reemplazo `<URL_DE_RENDER>` en `supabase/pendientes/20261122000500_cron_limpieza_pendientes.sql`, la muevo a `supabase/migrations/` y hago `supabase db push` (cron cada 15 min que llama a `/tareas/limpiar-pendientes`).
3. Compruebo en `cron.job_run_details` / `net._http_response` que la llamada responde 200.
4. Actualizo `docs/AVANCE.md`, `docs/pruebas.md` y te dejo el commit sugerido.

---

## 7. Pruebas que necesitan navegador (no se pueden automatizar desde aquí)

- [ ] **Pago real + correo**: entra con `echipanar@ulasalle.edu.pe` / `Demo1234!` → reserva → tarjeta `4242 4242 4242 4242`, `12/34`, `123` → debe volver a `/pago/exito` y llegarte el correo de confirmación. (El envío de Resend a tu correo ya se probó directo desde el backend y funcionó.)
- [ ] **Recordatorio real**: reserva y paga una cancha para **mañana** con tu correo → panel admin → Actividad → "Ejecutar recordatorios ahora" → debe llegarte el recordatorio.
- [ ] **MFA de `admin@canchaya.demo` y `propietario2@canchaya.demo`**: aún no tienen factor; la primera vez que entren les pedirá escanear el QR. Hazlo antes de la exposición con tu app autenticadora.
- [ ] **Revisión visual** de las pantallas nuevas (propietario: dashboard, complejos con mapa y foto, agenda; admin: todas; jugador: "Registrar mi complejo"; `/estado`) en escritorio y en móvil. Todo compila y los datos se probaron por API, pero nadie las miró en un navegador.
- [ ] Subir una **foto** a un complejo desde "Mis complejos" (prueba Storage).

## 8. Usuarios de prueba que creé (puedes borrarlos)

Para probar con sesión AAL2 sin tocar tus factores MFA creé:
- `qa.propietario@canchaya.demo` (propietario, con TOTP que solo conoce el script de pruebas) y su **"Complejo de prueba QA (se puede borrar)"** en estado *pendiente* → sirve para mostrar "Aprobar" en el panel admin.
- `qa.jugador@canchaya.demo` (jugador) y su **"Solicitud de prueba QA (se puede borrar)"** en estado *suspendido*.

Si no los quieres (recomendado antes de que el repo sea público o después de la demo):
1. Borra primero sus complejos (Supabase → Table Editor → `complejos` → los dos "…de prueba QA"; sus canchas y reservas de prueba se borran en cascada).
2. Luego Supabase → Authentication → Users → borra `qa.propietario@` y `qa.jugador@`.
   (Si borras primero el usuario, el complejo queda **sin dueño**, porque `propietario_id` es `on delete set null`.)

Si quieres que yo verifique producción con sesión MFA (AAL2) después del deploy, no los borres todavía: los uso para eso.

## 9. Otros pendientes

- [ ] Confirmar los precios de `docs/costos.md` en las páginas de cada proveedor (son referenciales).
- [ ] Mirar los diagramas Mermaid de `docs/arquitectura.md` en GitHub (no los pude renderizar aquí).
- [ ] Hoy 21-nov a las **18:00** corre por primera vez el cron de recordatorios: las reservas demo de mañana son de `jugador@canchaya.demo`, así que se registrarán como `omitido` (sin enviar). Es esperado.

## 10. Decisiones que dejé tomadas (cámbialas si no te gustan)

- **MFA también en la base (RLS restrictiva)**: un propietario/admin con solo contraseña no ve datos de negocio ni por la API REST. Efecto visible: si un propietario sin verificar MFA abre `/canchas`, verá la lista vacía (la app igual lo manda a `/mfa/verificar` antes).
- Moneda **PEN** (Stripe de prueba la acepta).
- Región de Render: **Virginia** (Render no tiene São Paulo).
- La migración de limpieza cada 15 min está en `supabase/pendientes/`, no en `migrations/`, para que un `db push` no la aplique con el placeholder.
