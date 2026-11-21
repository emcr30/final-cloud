-- =====================================================================
-- CanchaYa · Migración 9: recordatorio diario con pg_cron (Parte 8)
-- =====================================================================
-- Todos los días a las 18:00 de Lima (= 23:00 UTC; pg_cron usa UTC) la base
-- llama por HTTP (pg_net) a la Edge Function send-reminders, que envía el
-- recordatorio de las reservas pagadas de MAÑANA.
--
-- Los valores sensibles NO están en este archivo: se leen de Supabase Vault
-- (cifrado). Se cargan una sola vez, fuera del repositorio (ver
-- docs/AVANCE.md, Parte 8):
--   canchaya_project_url  → https://<ref>.supabase.co
--   canchaya_cron_secret  → el mismo CRON_SECRET del backend y de la función
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Si ya existía (re-ejecución), se reemplaza
select cron.unschedule(jobid) from cron.job where jobname = 'canchaya-recordatorios';

select cron.schedule(
  'canchaya-recordatorios',
  '0 23 * * *',  -- 23:00 UTC = 18:00 America/Lima (Perú no tiene horario de verano)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'canchaya_project_url')
               || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'canchaya_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
