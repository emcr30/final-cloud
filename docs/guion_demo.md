# Guion de la demo en vivo (~15 min)

## Credenciales demo (contraseña de todos: `Demo1234!`)

| Rol | Usuario | MFA |
|---|---|---|
| Jugador (recibe correos reales) | `echipanar@ulasalle.edu.pe` | No |
| Jugador (con historial grande) | `jugador@canchaya.demo` | No |
| Propietario 1 (Yanahuara, Cayma, Sachaca) | `propietario1@canchaya.demo` | Sí (app autenticadora) |
| Propietario 2 (Bustamante y Rivero, Cerro Colorado) | `propietario2@canchaya.demo` | Configurar antes |
| Administrador | `admin@canchaya.demo` | Configurar antes |

Tarjeta de prueba de Stripe: **4242 4242 4242 4242**, fecha **12/34**, CVC **123**, cualquier nombre.

## Preparación (30 min antes)

- [ ] Abrir `https://<backend>.onrender.com/health` para **despertar Render** (si no, el primer pago tarda ~1 min).
- [ ] Abrir `/estado` y confirmar todo en verde.
- [ ] Ventanas separadas (o perfiles de Chrome) para jugador, propietario y admin, **ya logueadas** (el MFA toma tiempo en vivo).
- [ ] Celular con la app autenticadora a mano.
- [ ] Bandeja de `echipanar@ulasalle.edu.pe` abierta.
- [ ] Pestañas: GitHub Actions (último CI verde), dashboards de Vercel, Render, Supabase (Table Editor, Edge Functions, Cron) y UptimeRobot.
- [ ] Que exista al menos un complejo **pendiente** (el "Complejo de prueba QA" sirve) para aprobarlo en vivo.

---

## 1. Introducción y arquitectura (2 min)

- "CanchaYa es un **SaaS multi-tenant** para reservar canchas de fútbol en Arequipa: cada complejo es un tenant y solo ve sus datos."
- Mostrar el diagrama de `docs/arquitectura.md`: **Vercel** (frontend en CDN), **Render** (FastAPI en Docker), **Supabase** (Postgres con RLS, Auth con MFA, Storage, Edge Functions, cron), **Stripe**, **Resend**, **GitHub Actions**, **UptimeRobot**.
- Mostrar `/estado`: semáforo en verde con latencias reales.

## 2. Jugador: buscar, reservar y pagar (4 min)

1. Sin sesión, ir a **Buscar canchas**: filtros (distrito, tipo, precio), cambiar a **Mapa**, pulsar **"Cerca de mí"** (distancias con Haversine).
2. Entrar a un complejo → elegir cancha, **mañana**, 2 horas seguidas → ver el total.
3. "Reservar y pagar" → pide login → entrar con `echipanar@ulasalle.edu.pe`.
4. Stripe Checkout → tarjeta 4242 → vuelve a **/pago/exito** con el comprobante.
5. Mostrar el **correo de confirmación** que llegó.
6. **Mis reservas**: aparece "Pagada". Explicar la regla de cancelar con más de 2 h (está en la política RLS, no solo en el botón).
7. (Opcional, 30 s) **Choque de horario**: dos pestañas, misma hora → la segunda dice "Ese horario acaba de ser tomado" (restricción `EXCLUDE` de Postgres).

## 3. Propietario: su negocio (3 min)

1. Entrar con `propietario1@canchaya.demo` → pide el **código de 6 dígitos** (MFA obligatorio).
2. **Dashboard**: ingresos, reservas, **ocupación %**, ingresos por día, ocupación por cancha y **heatmap de horas pico** (se ve el pico de 18:00-22:00 y fines de semana). Cambiar el rango a 7 días.
3. Descargar el **PDF** (y/o CSV).
4. **Agenda**: semana de una cancha; abrir la reserva recién pagada (nombre y teléfono del jugador); **bloquear** una hora libre.
5. **Mis complejos**: editar un complejo, mostrar el **mapa para elegir la ubicación** y las canchas (precio, activar/desactivar).

## 4. Aislamiento multi-tenant (1,5 min)

- "¿Puede propietario1 ver lo de propietario2?" → En su dashboard solo aparecen sus 3 complejos.
- Mostrar `supabase/tests/aislamiento_multitenant.sql` y la tabla de resultados en `docs/pruebas.md`: **24/24**. Remarcar: P1 intentando editar/cancelar cosas de P2 → 0 filas o error de RLS; propietario con solo contraseña (sin MFA) → 0 filas.
- Frase clave: "La seguridad no está en el frontend: está en **Postgres**. Aunque alguien llame directo a la API con su token, la base solo le devuelve sus filas."

## 5. Administrador (3 min)

1. Entrar con `admin@canchaya.demo` (+ MFA).
2. **Dashboard global**: usuarios por rol, complejos, reservas, ingresos y **comisión de la plataforma (10 %)**, top complejos, crecimiento por semana, mapa.
3. **Complejos → Pendientes** → **Aprobar** el complejo de prueba → explicar que el dueño pasa de jugador a propietario.
4. **Usuarios**: buscar `jugador@`, mostrar columna MFA, **Suspender** → (en otra ventana el login falla con "cuenta suspendida") → **Reactivar**.
5. **Configuración**: cambiar la comisión a 12 % → volver al dashboard y ver el cambio.
6. **Actividad → "Simular (dry run)"**: la Edge Function lista los recordatorios de mañana sin enviar. Luego **"Ejecutar recordatorios ahora"** → llega el **correo de recordatorio** de la reserva del paso 2. Mostrar "Últimas notificaciones" y "Últimos pagos".

## 6. Cloud y DevOps (1,5 min)

- **GitHub Actions**: último CI en verde (lint, build, 43 pruebas, imagen Docker).
- **Render**: logs del contenedor y health check `/health`; **Vercel**: deploys por commit.
- **Supabase**: Edge Function `send-reminders`, **Cron** (`canchaya-recordatorios` a las 23:00 UTC = 18:00 Lima, y la limpieza cada 15 min), **Vault** con los secretos.
- **UptimeRobot**: monitor de `/health` cada 5 min con su historial.

## 7. Cierre (30 s)

- Seguridad: MFA en 3 capas, RLS en 7 tablas (24 políticas), secretos fuera del repo, rate limit, CORS, webhook firmado.
- Costo actual **S/ 0** (todo en planes gratis) y estimación al crecer en `docs/costos.md` (≈ S/ 285/mes en un lanzamiento comercial).

---

## Plan B (si algo falla en vivo)

| Problema | Qué hacer |
|---|---|
| Render tarda (dormido) | Explicar el plan Free mientras carga `/health`; seguir con el panel propietario (va directo a Supabase). |
| Stripe no redirige | Mostrar una reserva ya pagada en "Mis reservas" y el comprobante; explicar el webhook. |
| No llega el correo | Panel admin → Actividad: mostrar el registro `enviado` con el id de Resend. |
| MFA: el código falla | Revisar la hora del celular (TOTP depende del reloj); usar la ventana ya logueada. |
| Sin internet | Video/capturas de respaldo grabados el día anterior. |
