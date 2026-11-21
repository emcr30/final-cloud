-- =====================================================================
-- CanchaYa · Migración 8: listado de usuarios para el panel admin (Parte 7)
-- =====================================================================
-- El email, el último ingreso, la suspensión (ban) y los factores MFA viven
-- en el esquema "auth", que la API no expone. Esta función los junta con
-- profiles en una sola consulta. Solo la puede ejecutar la service role
-- (el backend, después de comprobar que quien llama es admin con MFA).

create or replace function public.admin_listar_usuarios()
returns table (
  id              uuid,
  email           text,
  nombre          text,
  telefono        text,
  rol             public.rol_usuario,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  banned_until    timestamptz,
  mfa             boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    u.id, u.email::text, p.nombre, p.telefono, p.rol, u.created_at, u.last_sign_in_at, u.banned_until,
    exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as mfa
  from auth.users u
  join public.profiles p on p.id = u.id
  order by u.created_at desc;
$$;

revoke execute on function public.admin_listar_usuarios() from public, anon, authenticated;
grant execute on function public.admin_listar_usuarios() to service_role;

notify pgrst, 'reload schema';
