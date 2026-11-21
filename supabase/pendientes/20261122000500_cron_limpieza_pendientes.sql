-- =====================================================================
-- CanchaYa · Migración PENDIENTE: limpieza de reservas sin pagar cada 15 min
-- =====================================================================
-- ⚠️ Todavía NO está en supabase/migrations/ a propósito: necesita la URL del
-- backend en Render, que existe recién después del despliegue (Parte 9).
--
-- Cómo aplicarla (ver docs/PENDIENTES_EVELYN.md):
--   1. Reemplaza <URL_DE_RENDER> por tu URL, p. ej. canchaya-api.onrender.com
--      (sin https:// ni / al final):
--        sed -i '' 's#<URL_DE_RENDER>#canchaya-api.onrender.com#' supabase/pendientes/20261122000500_cron_limpieza_pendientes.sql
--   2. Muévela a migrations y aplícala:
--        mv supabase/pendientes/20261122000500_cron_limpieza_pendientes.sql supabase/migrations/
--        supabase db push
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
  if 'https://<URL_DE_RENDER>' like '%' || 'URL_DE_' || 'RENDER' || '%' then
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
    url     := 'https://<URL_DE_RENDER>/tareas/limpiar-pendientes',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'canchaya_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000  -- Render gratis puede tardar ~1 min en despertar
  );
  $$
);
