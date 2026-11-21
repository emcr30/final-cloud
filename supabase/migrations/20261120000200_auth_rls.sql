-- =====================================================================
-- CanchaYa · Migración 2: perfiles automáticos, helpers, privilegios y RLS
-- =====================================================================
-- Resumen de seguridad (dos capas):
--  1. PRIVILEGIOS por columna: qué columnas puede tocar un usuario logueado.
--     Así "nadie puede cambiar su propio rol" ni el estado de un complejo/pago.
--  2. RLS (Row Level Security): qué FILAS ve o modifica cada rol.
-- El backend usa la service role, que salta ambas capas (por eso es secreta).

-- ---------------------------------------------------------------------
-- 1) Al registrarse un usuario en auth.users se crea su perfil como 'jugador'
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, telefono, rol)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'telefono', ''),
    'jugador'  -- el registro público SIEMPRE crea jugadores
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- 2) Helpers. SECURITY DEFINER: se ejecutan con permisos del dueño y no
--    pasan por RLS, lo que evita recursión infinita entre políticas.
-- ---------------------------------------------------------------------
create or replace function public.mi_rol()
returns public.rol_usuario
language sql stable security definer set search_path = ''
as $$
  select rol from public.profiles where id = auth.uid();
$$;

create or replace function public.es_propietario_de(p_complejo_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.complejos
    where id = p_complejo_id and propietario_id = auth.uid()
  );
$$;

-- ¿La cancha pertenece a un complejo del usuario actual?
create or replace function public.es_propietario_de_cancha(p_cancha_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.canchas c
    join public.complejos x on x.id = c.complejo_id
    where c.id = p_cancha_id and x.propietario_id = auth.uid()
  );
$$;

-- ¿El usuario actual puede ver esta reserva? (dueño de la reserva, dueño del complejo o admin)
create or replace function public.puede_ver_reserva(p_reserva_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reservas r
    where r.id = p_reserva_id
      and (r.jugador_id = auth.uid() or public.es_propietario_de_cancha(r.cancha_id))
  ) or public.mi_rol() = 'admin';
$$;

-- ¿El jugador p_jugador_id reservó en algún complejo del usuario actual?
-- (para que el propietario vea nombre/teléfono de sus clientes en la agenda)
create or replace function public.es_cliente_mio(p_jugador_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reservas r
    join public.canchas c on c.id = r.cancha_id
    join public.complejos x on x.id = c.complejo_id
    where r.jugador_id = p_jugador_id and x.propietario_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Privilegios por columna
-- ---------------------------------------------------------------------
-- anon (visitante sin sesión) solo lee
revoke insert, update, delete on all tables in schema public from anon;

-- profiles: el usuario edita nombre y teléfono, NUNCA el rol
revoke insert, update, delete on public.profiles from authenticated;
grant update (nombre, telefono) on public.profiles to authenticated;

-- complejos: el dueño edita datos, pero no el estado ni el propietario
revoke update, delete on public.complejos from authenticated;
grant update (nombre, descripcion, direccion, distrito, lat, lng, foto_url, hora_apertura, hora_cierre)
  on public.complejos to authenticated;

-- reservas: se crean desde la app; solo se puede cambiar el estado (cancelar/completar).
-- Marcar 'pagada' lo hace el backend tras verificar el pago en Stripe.
revoke update, delete on public.reservas from authenticated;
grant update (estado) on public.reservas to authenticated;

-- pagos y notificaciones: solo lectura (escribe el backend)
revoke insert, update, delete on public.pagos, public.notificaciones_log from authenticated;

-- ---------------------------------------------------------------------
-- 4) RLS en TODAS las tablas
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.complejos          enable row level security;
alter table public.canchas            enable row level security;
alter table public.reservas           enable row level security;
alter table public.pagos              enable row level security;
alter table public.notificaciones_log enable row level security;

-- Nota: "(select auth.uid())" en lugar de "auth.uid()" es la recomendación de
-- Supabase para que Postgres lo evalúe una vez por consulta y no por fila.

-- ---------- profiles ----------
create policy "profiles: ver el propio, los clientes propios o todos si es admin"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.mi_rol()) = 'admin'
    or public.es_cliente_mio(id)
  );

create policy "profiles: editar solo el propio"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- complejos (tenant) ----------
create policy "complejos: lectura pública de activos; dueño y admin ven todo lo suyo"
  on public.complejos for select to anon, authenticated
  using (
    estado = 'activo'
    or propietario_id = (select auth.uid())
    or (select public.mi_rol()) = 'admin'
  );

-- "Solicitar ser propietario": cualquier usuario logueado registra un complejo
-- a su nombre y en estado pendiente. El admin lo aprueba desde el backend.
create policy "complejos: registrar uno propio en estado pendiente"
  on public.complejos for insert to authenticated
  with check (propietario_id = (select auth.uid()) and estado = 'pendiente');

create policy "complejos: el dueño edita los suyos"
  on public.complejos for update to authenticated
  using (propietario_id = (select auth.uid()))
  with check (propietario_id = (select auth.uid()));

-- ---------- canchas ----------
create policy "canchas: lectura pública de activas en complejos activos; dueño y admin todo"
  on public.canchas for select to anon, authenticated
  using (
    (activa and exists (
      select 1 from public.complejos x where x.id = complejo_id and x.estado = 'activo'
    ))
    or public.es_propietario_de(complejo_id)
    or (select public.mi_rol()) = 'admin'
  );

create policy "canchas: el dueño crea canchas en sus complejos"
  on public.canchas for insert to authenticated
  with check (public.es_propietario_de(complejo_id));

create policy "canchas: el dueño edita sus canchas"
  on public.canchas for update to authenticated
  using (public.es_propietario_de(complejo_id))
  with check (public.es_propietario_de(complejo_id));

create policy "canchas: el dueño elimina sus canchas"
  on public.canchas for delete to authenticated
  using (public.es_propietario_de(complejo_id));

-- ---------- reservas ----------
create policy "reservas: jugador las suyas, propietario las de sus canchas, admin todas"
  on public.reservas for select to authenticated
  using (
    jugador_id = (select auth.uid())
    or public.es_propietario_de_cancha(cancha_id)
    or (select public.mi_rol()) = 'admin'
  );

create policy "reservas: crear a nombre propio y pendiente de pago"
  on public.reservas for insert to authenticated
  with check (jugador_id = (select auth.uid()) and estado = 'pendiente_pago');

create policy "reservas: el jugador cancela las suyas"
  on public.reservas for update to authenticated
  using (jugador_id = (select auth.uid()) and estado in ('pendiente_pago', 'pagada'))
  with check (jugador_id = (select auth.uid()) and estado = 'cancelada');

create policy "reservas: el propietario completa o cancela las de sus canchas"
  on public.reservas for update to authenticated
  using (public.es_propietario_de_cancha(cancha_id))
  with check (public.es_propietario_de_cancha(cancha_id) and estado in ('completada', 'cancelada'));

-- ---------- pagos ----------
create policy "pagos: visibles si se puede ver la reserva"
  on public.pagos for select to authenticated
  using (public.puede_ver_reserva(reserva_id));

-- ---------- notificaciones_log ----------
create policy "notificaciones: solo admin"
  on public.notificaciones_log for select to authenticated
  using ((select public.mi_rol()) = 'admin');

-- ---------------------------------------------------------------------
-- 5) RPC disponibilidad(cancha, fecha): grilla de horas del día con su estado.
--    SECURITY DEFINER porque el jugador no puede leer reservas ajenas (RLS),
--    pero sí necesita saber qué horas están ocupadas (sin ver de quién).
-- ---------------------------------------------------------------------
create or replace function public.disponibilidad(p_cancha_id uuid, p_fecha date)
returns table (hora_inicio time, hora_fin time, disponible boolean)
language sql stable security definer set search_path = ''
as $$
  with cancha as (
    select x.hora_apertura, x.hora_cierre
    from public.canchas c
    join public.complejos x on x.id = c.complejo_id
    where c.id = p_cancha_id and c.activa and x.estado = 'activo'
  ),
  horas as (
    select h::time as hora_inicio, (h + interval '1 hour')::time as hora_fin
    from cancha,
         generate_series(p_fecha + cancha.hora_apertura,
                         p_fecha + cancha.hora_cierre - interval '1 hour',
                         interval '1 hour') as h
  )
  select
    hs.hora_inicio,
    hs.hora_fin,
    -- libre si no se cruza con una reserva vigente y no es una hora ya pasada (hora Lima)
    not exists (
      select 1 from public.reservas r
      where r.cancha_id = p_cancha_id
        and r.fecha = p_fecha
        and r.estado <> 'cancelada'
        and r.hora_inicio < hs.hora_fin
        and r.hora_fin > hs.hora_inicio
    )
    and (p_fecha + hs.hora_inicio) > (now() at time zone 'America/Lima') as disponible
  from horas hs
  order by hs.hora_inicio;
$$;

grant execute on function public.disponibilidad(uuid, date) to anon, authenticated;
