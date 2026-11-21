# Módulos de CanchaYa

Nivel de acceso: **Público** (sin cuenta) · **Jugador** · **Propietario** (con MFA) · **Admin** (con MFA).
"Dónde se protege" indica la barrera real; las rutas del frontend son solo experiencia de usuario.

| Módulo | Descripción funcional | Público | Jugador | Propietario | Admin | Dónde se protege |
|---|---|:-:|:-:|:-:|:-:|---|
| Landing | Presentación, cómo funciona, "Registra tu complejo" | ✅ | ✅ | ✅ | ✅ | — |
| Registro e inicio de sesión | Crear cuenta (siempre jugador), login, recuperar contraseña | ✅ | ✅ | ✅ | ✅ | Supabase Auth; trigger crea el perfil `jugador` |
| MFA (TOTP) | Configurar y verificar app autenticadora | — | Opcional | **Obligatorio** | **Obligatorio** | Supabase Auth (AAL2) + `require_role` + RLS `mfa_ok()` |
| Mi perfil | Editar nombre/teléfono, ver/activar MFA, cerrar sesión | — | ✅ | ✅ | ✅ | RLS: solo el propio perfil; permisos por columna (no puede cambiar su rol) |
| Buscar canchas (lista + mapa) | Filtros por distrito, tipo y precio; mapa OpenStreetMap; "Cerca de mí" (Haversine) | ✅ | ✅ | ✅ | ✅ | RLS: solo complejos y canchas activos son públicos |
| Detalle y disponibilidad | Grilla de horas libres, elegir 1-3 horas, total | ✅ | ✅ | ✅ | ✅ | RPC `disponibilidad()` (no revela quién reservó) |
| Reservar | Crear reserva pendiente de pago | — | ✅ | — | — | RLS + trigger de monto + restricción EXCLUDE |
| Pago en línea | Stripe Checkout, comprobante, correo de confirmación | — | ✅ | — | — | Backend: dueño de la reserva; webhook con firma |
| Mis reservas | Próximas e historial; pagar; cancelar (> 2 h antes) | — | ✅ | — | — | RLS (solo las suyas; regla de 2 h en la política) |
| Panel del jugador | Próxima reserva, total gastado, reservas del mes | — | ✅ | — | — | `resumen_jugador()` con RLS |
| Solicitar ser propietario | Registrar un complejo en estado pendiente | — | ✅ | — | — | RLS: insertar solo propio y `pendiente` |
| Dashboard del propietario | Ingresos, reservas, ocupación %, ingresos diarios, ocupación por cancha, horas pico, rango de fechas | — | — | ✅ | — | `metricas()` con RLS (solo sus complejos) |
| Exportar reportes | Reservas del rango en CSV y PDF | — | — | ✅ (los suyos) | ✅ (todos) | Backend `require_role` + filtro por `propietario_id` |
| Mis complejos | Crear/editar complejo, ubicación en mapa, foto (Storage) | — | — | ✅ | — | RLS + permisos por columna (no puede cambiar `estado`) + trigger |
| Canchas | Crear, editar, activar/desactivar, eliminar sin historial | — | — | ✅ | — | RLS: solo canchas de sus complejos |
| Agenda semanal | Calendario por cancha, datos del cliente, marcar completada, cancelar, bloquear horario | — | — | ✅ | — | RLS (reservas de sus canchas; bloqueos solo en sus canchas) |
| Dashboard global | Usuarios por rol, complejos, reservas, ingresos, comisión, top complejos, crecimiento, mapa | — | — | — | ✅ | Backend `require_role("admin")` + RLS |
| Gestión de usuarios | Buscar, filtrar, cambiar rol, suspender/reactivar, ver MFA | — | — | — | ✅ | Backend (service role + Supabase Auth admin) |
| Gestión de complejos | Aprobar (y pasar dueño a propietario), rechazar, suspender, reactivar | — | — | — | ✅ | Backend (service role) |
| Actividad | Últimas notificaciones y pagos; ejecutar recordatorios | — | — | — | ✅ | RLS (`notificaciones_log` solo admin) + backend |
| Configuración | Comisión (%) y minutos para pagar | — | — | — | ✅ | RLS + CHECK en la base |
| Recordatorios automáticos | Correo el día anterior a las 18:00 | — | (recibe) | — | (dispara) | Edge Function con secreto + pg_cron |
| Limpieza de pendientes | Cancela reservas sin pagar tras N minutos y expira la sesión de Stripe | — | — | — | — | Backend `X-Cron-Secret` + pg_cron |
| Estado del servicio | Semáforo de backend, base, auth e integraciones | ✅ | ✅ | ✅ | ✅ | Solo lectura; no muestra secretos |

## Endpoints del backend

| Método y ruta | Acceso | Para qué |
|---|---|---|
| `GET /health` | Público (sin rate limit) | Health check de Render y UptimeRobot |
| `GET /health/servicios` | Público | Qué integraciones están configuradas (sí/no) |
| `GET /me`, `GET /me/admin` | Logueado / admin | Prueba de autenticación |
| `POST /pagos/checkout` | Jugador dueño | Crear sesión de Stripe |
| `POST /pagos/verificar` | Jugador dueño o admin | Confirmar pago al volver de Stripe |
| `POST /pagos/webhook` | Stripe (firma) | Confirmar pago por webhook |
| `POST /tareas/limpiar-pendientes` | `X-Cron-Secret` | Limpieza programada |
| `GET /reportes/export` | Propietario / admin (AAL2) | CSV / PDF |
| `GET /admin/resumen`, `/admin/usuarios`, `/admin/complejos` | Admin (AAL2) | Datos del panel |
| `PATCH /admin/usuarios/{id}/rol`, `POST /admin/usuarios/{id}/suspension` | Admin (AAL2) | Gestión de usuarios |
| `PATCH /admin/complejos/{id}/estado` | Admin (AAL2) | Aprobar / suspender |
| `POST /admin/recordatorios` | Admin (AAL2) | Ejecutar la Edge Function |

Documentación interactiva: `<backend>/docs` (Swagger generado por FastAPI).
