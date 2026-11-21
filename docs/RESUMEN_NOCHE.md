# Resumen de la noche (21-nov-2026, ~00:40 – 01:35 hora de Lima)

## ✅ Qué quedó listo

| Tarea | Estado | Detalle |
|---|---|---|
| 0. Jugador con tu correo | ✅ | `echipanar@ulasalle.edu.pe` / `Demo1234!` (jugador) ya estaba en el script; lo ejecuté. **Correo de confirmación real enviado con Resend** a tu correo (revisa la bandeja / spam). |
| 1. Verificar Partes 4 y 5 | ✅ | Build, lint, 23 pruebas y 16 comprobaciones E2E reales (reserva, monto recalculado, choque 23P01, checkout de Stripe, 401/402/403, cancelar). No faltaba nada. |
| 2. Parte 6 – Propietario | ✅ | Dashboard (KPIs, ingresos diarios, ocupación, heatmap de horas pico, rango de fechas), export CSV/PDF, Mis complejos (mapa + foto), canchas, agenda semanal con bloqueos. **Aislamiento multi-tenant 24/24**. MFA también en RLS. |
| 3. Parte 7 – Admin | ✅ | Dashboard global con comisión, usuarios (rol, suspender, MFA), aprobar/suspender complejos, actividad, configuración. Jugador: "Registrar mi complejo". 26/26 E2E. |
| 4. Parte 8 – Automatización | ✅ | Edge Function `send-reminders` **desplegada**, secrets cargados desde `backend/.env`, secretos del cron en **Vault**, cron diario **18:00 Lima aplicado**, probada con `dry_run` (21 reservas, 0 envíos) y desde la propia base (pg_net → 200). Migración de limpieza cada 15 min **sin aplicar** en `supabase/pendientes/` con placeholder y curl documentado. |
| 5. Parte 9 – Archivos de deploy | ✅ | `frontend/vercel.json`, `render.yaml`, `.github/workflows/ci.yml`, página `/estado`, `GET /health/servicios`, badge. **Nada desplegado.** Checklist en `docs/PENDIENTES_EVELYN.md`. |
| 6. Parte 10 – Pulido y docs | ✅ | Rate limit (slowapi), CORS estricto, carga diferida (710 → 543 kB), títulos por página; prueba de carga (312 req/s, 0 errores); `arquitectura.md`, `modulos.md`, `seguridad.md`, `costos.md`, `pruebas.md`, `guion_demo.md`. |

Estado final verificado: `npm run lint` 0 problemas · `npm run build` OK · `pytest` **43/43** · backend y frontend arrancan y responden.

### Cambios en la base remota (todos con migraciones versionadas)
- Aplicadas: `20261122000100` (MFA en RLS, bloqueos, `metricas()`), `20261122000200` (`configuracion`), `20261122000300` (`admin_listar_usuarios()`), `20261122000400` (cron de recordatorios).
- Vault: `canchaya_project_url`, `canchaya_cron_secret`. Secrets de la función: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
- **No borré datos.** No hice `db reset`, commits ni push.

## ⚠️ Qué falló, quedó a medias o hay que mirar

- **Nada falló**, pero hay cosas que solo se pueden probar en el navegador (no las vi en pantalla):
  - Pagar con la tarjeta 4242 y ver el correo de confirmación por el flujo completo.
  - Mirar visualmente las páginas nuevas (propietario, admin, `/estado`, "Registrar mi complejo") en escritorio y móvil. Compilan y los datos se probaron por API, pero **nadie las miró**.
  - Subir una foto de complejo.
- **`admin@` y `propietario2@` no tienen MFA todavía**: configúralos con tu app antes de la demo.
- **Usuarios de prueba creados** por mí: `qa.propietario@canchaya.demo` (complejo QA *pendiente*, útil para "Aprobar" en la demo) y `qa.jugador@canchaya.demo` (complejo QA *suspendido*). Cómo borrarlos en `PENDIENTES_EVELYN.md` §8.
- La limpieza de pendientes **canceló una reserva tuya** sin pagar (23-nov 09:00, creada a las 00:43): es el comportamiento esperado.
- **Hoy a las 18:00** corre el cron por primera vez: las reservas demo de mañana son de `jugador@canchaya.demo` → quedarán como `omitido` en Actividad. Normal.
- **Decisión tomada sin preguntarte**: MFA también en la base (política RESTRICTIVE). Un propietario/admin sin verificar el código no ve datos ni por la API. Si no te convence, se revierte con una migración pequeña.
- **Stripe no opera con empresas de Perú** (lo anoté en `costos.md`): en modo prueba funciona con PEN; para producción real habría que usar Culqi/Niubiz/Mercado Pago. Sirve como comentario en la exposición.
- Precios de `costos.md` = referenciales; confírmalos.
- Commits intermedios: algunos archivos tienen cambios de varias partes (`App.tsx`, `main.py`, `AVANCE.md`), así que los commits intermedios pueden no compilar solos. Haz todos y luego **un solo push**.

## 📋 Pasos al despertar, en orden

1. **Leer** este archivo y revisar tu correo (confirmación de prueba de Resend).
2. **Probar en local** (10 min): `cd backend && .venv/bin/uvicorn app.main:app --reload` y `cd frontend && npm run dev` →
   entra como `propietario1@` (MFA) → Dashboard, Agenda, Mis complejos; como `admin@` (configura MFA) → todas las secciones; como `echipanar@` → reservar y pagar con 4242 (debe llegarte el correo). Si algo se ve mal, dímelo.
   (Ojo: tienes un uvicorn `--reload` viejo en el puerto 8000; si no toma los cambios, reinícialo. Yo usé el 8001 para mis pruebas.)
3. **Commits**: sigue `docs/COMMITS_PENDIENTES.md` (Partes 5 → 10, en orden) y luego `git push origin main`. Verifica que el CI salga en verde en GitHub Actions.
4. **Desplegar** siguiendo `docs/PENDIENTES_EVELYN.md`: Render (§1) → Vercel (§2) → `FRONTEND_URL` en Render → Supabase Auth URLs (§3) → Stripe webhook (§4) → UptimeRobot (§5).
5. **Pídeme**: "Ya desplegué. Vercel: https://… Render: https://… Verifica producción y aplica la migración de limpieza." Yo pruebo producción, aplico el cron de 15 min y actualizo docs.
6. Configurar MFA de `admin@` y `propietario2@`; hacer un pago de prueba en producción y un recordatorio real (reserva para mañana + "Ejecutar recordatorios ahora").
7. Ensayar con `docs/guion_demo.md` y grabar un video de respaldo.
8. Tag final: `git tag -a v1.0 -m "CanchaYa v1.0 — entrega final de Cloud Computing"` y `git push origin v1.0`.
