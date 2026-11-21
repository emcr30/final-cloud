# Seguridad de CanchaYa

Principio: **defensa en profundidad**. Ninguna regla depende solo del frontend; cada acción sensible tiene al menos una barrera en la base de datos o en el backend.

## 1. Autenticación

- **Supabase Auth** (email + contraseña). Las contraseñas se guardan con hash **bcrypt**; nunca pasan por nuestro backend.
- Sesión = **JWT** firmado por Supabase (expira en 1 h y se renueva con un refresh token). El frontend lo envía al backend como `Authorization: Bearer <token>`.
- El backend **no confía en el JWT a ciegas**: lo valida con `supabase.auth.get_user(token)` (firma y expiración) y lee el **rol desde la tabla `profiles`** en cada petición (si el admin cambia un rol, aplica al instante).
- El **registro público siempre crea `jugador`** (trigger `crear_perfil_nuevo_usuario`). Nadie puede cambiar su propio rol: `authenticated` solo tiene permiso de `UPDATE (nombre, telefono)` en `profiles`.
- **Suspensión**: el admin aplica un *ban* en Supabase Auth; el usuario no puede iniciar sesión ni renovar su token (probado: `400 user is banned`).
- Recuperación de contraseña por correo con enlace a `/nueva-password` (dominios permitidos en Supabase → URL Configuration).

## 2. MFA (TOTP)

| Rol | MFA | Cómo se exige |
|---|---|---|
| admin | **Obligatorio** | Frontend → `/mfa/configurar`; backend → `require_role` pide `aal2`; base → política RESTRICTIVE |
| propietario | **Obligatorio** | Igual que admin |
| jugador | Opcional | Desde "Mi perfil" |

- Factor **TOTP** (Google Authenticator, Authy…): `mfa.enroll` → QR + secreto → `mfa.challenge` + `mfa.verify`. Al verificar, el JWT pasa de `aal1` a **`aal2`**.
- **Tres barreras**:
  1. **Frontend** (`RutaProtegida`): sin factor → configurar; con factor y `aal1` → verificar. *Solo UX.*
  2. **Backend** (`require_role("admin" | "propietario")`): si el rol exige MFA y el claim `aal` no es `aal2` → **403**.
  3. **Base de datos**: política **RESTRICTIVE** `mfa: admin y propietario requieren aal2` en `complejos`, `canchas`, `reservas`, `pagos`, `notificaciones_log` y `configuracion`, con `public.mfa_ok()`. Quien robe **solo la contraseña** de un propietario y llame directo a la API REST recibe **0 filas** (probado).

## 3. Autorización: Row Level Security (multi-tenant)

RLS está **activado en las 7 tablas** de `public`. Las políticas *permissive* se combinan con OR; la *restrictive* de MFA se combina con AND. Helpers `SECURITY DEFINER` (`mi_rol()`, `es_propietario_de()`, `es_propietario_de_cancha()`, `puede_ver_reserva()`, `es_cliente_mio()`, `mfa_ok()`) con `search_path = ''` para evitar secuestro de funciones y recursión entre políticas.

**24 políticas** (listado obtenido de `pg_policy` en el proyecto remoto):

| Tabla | Comando | Política |
|---|---|---|
| profiles | SELECT | ver el propio, los clientes propios o todos si es admin |
| profiles | UPDATE | editar solo el propio |
| complejos | SELECT | lectura pública de activos; dueño y admin ven todo lo suyo |
| complejos | INSERT | registrar uno propio en estado pendiente |
| complejos | UPDATE | el dueño edita los suyos (sin `estado` ni `propietario_id`: permisos por columna + trigger) |
| complejos | ALL (restrictive) | MFA aal2 para admin/propietario |
| canchas | SELECT | lectura pública de activas en complejos activos; dueño y admin todo |
| canchas | INSERT / UPDATE / DELETE | el dueño, solo en sus complejos |
| canchas | ALL (restrictive) | MFA aal2 |
| reservas | SELECT | jugador las suyas, propietario las de sus canchas, admin todas |
| reservas | INSERT | jugador: a su nombre, `pendiente_pago`, sin `es_bloqueo` |
| reservas | INSERT | propietario: bloqueo (`pagada` + `es_bloqueo`) solo en sus canchas |
| reservas | UPDATE | jugador cancela las suyas si faltan > 2 h |
| reservas | UPDATE | propietario completa o cancela las de sus canchas |
| reservas | ALL (restrictive) | MFA aal2 |
| pagos | SELECT | visibles si se puede ver la reserva |
| pagos | ALL (restrictive) | MFA aal2 |
| notificaciones_log | SELECT | solo admin |
| notificaciones_log | ALL (restrictive) | MFA aal2 |
| configuracion | SELECT / UPDATE | solo admin |
| configuracion | ALL (restrictive) | MFA aal2 |

Además:
- **Permisos por columna**: `reservas` solo permite `UPDATE (estado)`; `pagos` y `notificaciones_log` no admiten escrituras de usuarios (solo el backend con service role). Marcar una reserva como **pagada** solo lo hace el backend tras verificar con Stripe.
- **Storage**: bucket `complejos` público para lectura; subir solo propietarios/admin; editar/borrar solo el autor o el admin; máximo 5 MB y solo JPG/PNG/WEBP.
- **Funciones RPC**: `disponibilidad()` es `SECURITY DEFINER` pero solo devuelve horas libres/ocupadas (no quién reservó). `admin_listar_usuarios()` y `seed_asociar_demo()` solo las ejecuta la service role.
- **Prueba de aislamiento multi-tenant**: `supabase/tests/aislamiento_multitenant.sql` → **24/24 OK** (ver `docs/pruebas.md`).

## 4. Backend (API)

- **Service role solo en el backend**. Al arrancar, `validar_service_role_key()` se niega a iniciar si se pegó por error la llave pública.
- **CORS restringido** a `FRONTEND_URL` (Vercel y localhost), métodos `GET/POST/PATCH/OPTIONS` y cabeceras `Authorization, Content-Type`; sin cookies (`allow_credentials=False`). Probado: un origen ajeno no recibe `Access-Control-Allow-Origin`.
- **Rate limit** (slowapi): **100 peticiones/minuto por IP y por ruta** → `429` en español. `/health` exento (monitoreo). Detrás del proxy de Render, uvicorn usa `--proxy-headers` para ver la IP real. Prueba: 150 peticiones → 100 × 401 y 50 × 429.
- **Stripe webhook** verificado con la firma `Stripe-Signature` (`STRIPE_WEBHOOK_SECRET`); sin secreto responde 503 en vez de aceptar cualquier cosa.
- **Tareas programadas** (`/tareas/*`) y **Edge Function** protegidas con un secreto compartido comparado en **tiempo constante** (`hmac.compare_digest` / XOR en Deno).
- **Idempotencia del pago**: `UPDATE … WHERE estado = 'pendiente_pago'` + `pagos.stripe_session_id UNIQUE`: aunque la página de éxito y el webhook lleguen a la vez, se cobra, registra y envía el correo **una sola vez**.
- **El monto lo calcula la base** (trigger): el cliente no puede pagar menos (probado: envió 1, se guardó 120.00).
- **Plantillas de correo con escape de HTML** (nombres y direcciones no pueden inyectar HTML).
- **Validación** con Pydantic (roles y estados como `Literal`, fechas tipadas, rango máximo de 366 días en reportes).
- Imagen Docker con **usuario sin privilegios** (`appuser`).

## 5. Frontend

- Solo usa la **anon/publishable key** (pública por diseño; la protección es RLS).
- Cabeceras de seguridad en Vercel (`vercel.json`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (anti-clickjacking), `Referrer-Policy`, `Permissions-Policy` (cámara y micrófono desactivados; geolocalización solo propia).
- React escapa el contenido por defecto (sin `dangerouslySetInnerHTML`).

## 6. Gestión de secretos

| Secreto | Dónde vive | Nunca en |
|---|---|---|
| Service role de Supabase, Stripe, Resend, CRON_SECRET, webhook | `backend/.env` (local, en `.gitignore`), variables de entorno de Render | Repositorio, frontend |
| Llaves de la Edge Function | `supabase secrets` | Repositorio |
| URL y secreto del cron | **Supabase Vault** (cifrado) | Migraciones SQL |
| Anon/publishable key | `frontend/.env`, Vercel | — (es pública) |

- `.env.example` documentados sin valores reales.
- Revisión del 21-nov-2026: ningún archivo versionable contiene patrones de llaves (`sk_test_`, `sb_secret_`, `re_…`, `whsec_`, JWT) ni el valor de `CRON_SECRET`; ningún `.env` está en git.

## 7. Cifrado

- **En tránsito**: TLS/HTTPS en todos los saltos (navegador ↔ Vercel, Render y Supabase; Render/Supabase ↔ Stripe y Resend; pg_net ↔ Edge Function). Certificados automáticos de Vercel y Render.
- **En reposo**: Supabase cifra la base y los backups con **AES-256**; Vault agrega cifrado propio para los secretos del cron. Stripe guarda los datos de tarjeta (cumple **PCI DSS**): CanchaYa nunca ve el número de tarjeta.

## 8. Backups y recuperación ante fallos

| Riesgo | Mitigación |
|---|---|
| Pérdida de datos | Supabase hace **backup diario automático** (plan Free: se pueden descargar manualmente; plan Pro: 7 días de retención y **PITR** opcional). El esquema completo se puede recrear con `supabase db push` desde `supabase/migrations/` + `seed.sql`. |
| Caída del backend | Render reinicia el contenedor si `/health` falla; UptimeRobot alerta por correo; el frontend sigue mostrando el catálogo (lee directo de Supabase). |
| Caída del frontend | Vercel sirve desde CDN con varias regiones; rollback a un deploy anterior con un clic. |
| Mal deploy | CI bloquea código que no compila o no pasa pruebas; Render y Vercel permiten **rollback** al deploy previo. |
| Webhook de Stripe perdido | La página de éxito también confirma; y la limpieza consulta Stripe antes de cancelar (si estaba pagada, confirma). |
| Reservas fantasmas (no pagadas) | Limpieza cada 15 min: expira la sesión de Stripe y libera el horario. |
| Fuga de un secreto | Rotar en el proveedor y actualizar Render / `supabase secrets` / Vault; los secretos no están en el repo. |
| Proyecto Supabase Free pausado por inactividad (~7 días sin uso) | Usar la app antes de la demo; si se pausa, se reactiva desde el dashboard ("Restore project") sin perder datos. |
