-- =====================================================================
-- CanchaYa · Limpieza de reservas sin pagar cada 15 min
-- =====================================================================
-- Aplicada en producción el 21-nov-2026, después del despliegue, con la URL
-- del backend en Render (canchaya-api-e2nd.onrender.com). Si el backend
-- cambia de URL: actualizar la URL de abajo y volver a ejecutar este archivo
-- (cron.schedule reemplaza el job del mismo nombre).
--
-- Qué hace: cada 15 minutos pg_cron llama a POST /tareas/limpiar-pendientes
-- del backend con el header X-Cron-Secret (leído de Vault, el mismo
-- CRON_SECRET que debe estar en las variables de entorno de Render).
-- El backend cancela las reservas pendiente_pago con más de N minutos
-- (N = configuracion.minutos_expiracion) y expira su sesión de Stripe.
-- Además, la llamada mantiene despierto el backend del plan gratuito.
-- =====================================================================

-- Protección: si alguien la aplica sin reemplazar la URL, falla con un mensaje claro
do $$
begin
  if 'https://canchaya-api-e2nd.onrender.com' like '%' || 'URL_DE_' || 'RENDER' || '%' then
    raise exception 'Falta reemplazar <URL_DE_RENDER> por la URL del backend en Render';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'canchaya-limpiar-pendientes';

select cron.schedule(
  'canchaya-limpiar-pendientes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://canchaya-api-e2nd.onrender.com/tareas/limpiar-pendientes',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'canchaya_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000  -- Render gratis puede tardar ~1 min en despertar
  );
  $$
);
