-- =====================================================================
-- CanchaYa · Migración 6: panel del propietario (Parte 6)
-- =====================================================================
--  1. MFA en la base de datos: admin y propietario solo leen/escriben datos
--     de negocio con sesión AAL2 (política RESTRICTIVE).
--  2. Bloqueos de horario: "reserva interna" del propietario, sin pago.
--  3. Función metricas(): todos los números del dashboard en una sola llamada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) MFA obligatorio también en la base (defensa en profundidad)
--    Las políticas normales son PERMISSIVE (se combinan con OR). Una
--    política RESTRICTIVE se combina con AND: aunque otra política deje
--    pasar la fila, si esta no se cumple, no se ve.
--    Regla: si tu rol es admin o propietario, tu token debe tener aal = 'aal2'.
--    Así, quien robe solo la contraseña de un propietario no puede leer su
--    agenda ni sus pagos llamando directo a la API REST.
--    profiles queda fuera: la app necesita leer el rol para mandar a /mfa/verificar.
-- ---------------------------------------------------------------------
create or replace function public.mfa_ok()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.mi_rol()::text, 'jugador') = 'jugador'
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create policy "mfa: admin y propietario requieren aal2" on public.complejos
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "mfa: admin y propietario requieren aal2" on public.canchas
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "mfa: admin y propietario requieren aal2" on public.reservas
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "mfa: admin y propietario requieren aal2" on public.pagos
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
create policy "mfa: admin y propietario requieren aal2" on public.notificaciones_log
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- ---------------------------------------------------------------------
-- 2) Bloqueos: el propietario reserva un horario para uso interno
--    (mantenimiento, torneo, cliente que pagó en efectivo). No genera ingreso.
-- ---------------------------------------------------------------------
alter table public.reservas add column es_bloqueo boolean not null default false;
comment on column public.reservas.es_bloqueo is 'Reserva interna del propietario: sin pago, monto 0, no cuenta como ingreso.';

-- El trigger de validación pone monto 0 a los bloqueos
create or replace function public.validar_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precio    numeric;
  v_activa    boolean;
  v_estado    public.estado_complejo;
  v_apertura  time;
  v_cierre    time;
begin
  select c.precio_hora, c.activa, x.estado, x.hora_apertura, x.hora_cierre
    into v_precio, v_activa, v_estado, v_apertura, v_cierre
  from public.canchas c
  join public.complejos x on x.id = c.complejo_id
  where c.id = new.cancha_id;

  if not found then
    raise exception 'La cancha no existe';
  end if;

  -- Un bloqueo se permite aunque la cancha esté desactivada (p. ej. mantenimiento)
  if tg_op = 'INSERT' and not new.es_bloqueo and (not v_activa or v_estado <> 'activo') then
    raise exception 'La cancha no está disponible para reservas';
  end if;

  if new.hora_inicio < v_apertura or new.hora_fin > v_cierre then
    raise exception 'El horario está fuera de la atención del complejo (% - %)', v_apertura, v_cierre;
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null
     and (new.fecha + new.hora_inicio) < (now() at time zone 'America/Lima') then
    raise exception 'No se puede reservar en el pasado';
  end if;

  -- Precio por hora × número de horas (los bloqueos no cobran)
  new.monto := case when new.es_bloqueo then 0
                    else v_precio * extract(epoch from (new.hora_fin - new.hora_inicio)) / 3600 end;
  return new;
end;
$$;

-- El jugador NO puede crear bloqueos (si no, reservaría gratis)
drop policy if exists "reservas: crear a nombre propio y pendiente de pago" on public.reservas;
create policy "reservas: crear a nombre propio y pendiente de pago"
  on public.reservas for insert to authenticated
  with check (jugador_id = (select auth.uid()) and estado = 'pendiente_pago' and not es_bloqueo);

-- El propietario bloquea horarios SOLO en sus canchas, a su nombre
create policy "reservas: el propietario bloquea horarios de sus canchas"
  on public.reservas for insert to authenticated
  with check (
    es_bloqueo
    and estado = 'pagada'
    and jugador_id = (select auth.uid())
    and public.es_propietario_de_cancha(cancha_id)
  );

-- Los ingresos diarios no cuentan bloqueos (mismas columnas: se puede reemplazar)
create or replace view public.v_ingresos_diarios with (security_invoker = on) as
select
  x.id          as complejo_id,
  x.nombre      as complejo,
  r.fecha,
  count(*)      as reservas,
  sum(r.monto)  as ingresos
from public.reservas r
join public.canchas c   on c.id = r.cancha_id
join public.complejos x on x.id = c.complejo_id
where r.estado in ('pagada', 'completada') and not r.es_bloqueo
group by x.id, x.nombre, r.fecha;

-- ---------------------------------------------------------------------
-- 3) metricas(desde, hasta, complejo): datos del dashboard en JSON.
--    SECURITY INVOKER → corre con los permisos de quien llama, así que RLS
--    filtra: el propietario recibe SOLO lo de sus complejos y el admin todo.
--    Se calcula en Postgres porque la API REST corta en 1000 filas.
--    "Reserva válida" = pagada o completada y que no sea bloqueo.
-- ---------------------------------------------------------------------
create or replace function public.metricas(p_desde date, p_hasta date, p_complejo_id uuid default null)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with
  cx as (   -- complejos visibles para quien consulta (RLS)
    select x.* from public.complejos x
    where (p_complejo_id is null or x.id = p_complejo_id)
      and (x.propietario_id = auth.uid() or public.mi_rol() = 'admin')
  ),
  ca as (
    select c.*, cx.nombre as complejo, cx.hora_apertura, cx.hora_cierre
    from public.canchas c join cx on cx.id = c.complejo_id
  ),
  rs as (   -- reservas del rango
    select r.*, ca.nombre as cancha, ca.complejo_id
    from public.reservas r join ca on ca.id = r.cancha_id
    where r.fecha between p_desde and p_hasta
  ),
  validas as (
    select * from rs where estado in ('pagada', 'completada') and not es_bloqueo
  ),
  dias as (
    select (p_hasta - p_desde + 1) as n
  ),
  -- horas que estuvo abierta cada cancha activa en el rango
  capacidad as (
    select coalesce(sum(extract(epoch from (hora_cierre - hora_apertura)) / 3600), 0) * (select n from dias) as horas
    from ca where activa
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'ingresos',  coalesce((select sum(monto) from validas), 0),
      'reservas',  (select count(*) from validas),
      'canceladas', (select count(*) from rs where estado = 'cancelada'),
      'pendientes', (select count(*) from rs where estado = 'pendiente_pago'),
      'bloqueos',  (select count(*) from rs where es_bloqueo and estado <> 'cancelada'),
      'horas_reservadas', coalesce((select sum(extract(epoch from (hora_fin - hora_inicio)) / 3600) from validas), 0),
      'ocupacion', case when (select horas from capacidad) > 0
                     then round(100 * coalesce((select sum(extract(epoch from (hora_fin - hora_inicio)) / 3600) from validas), 0)
                                / (select horas from capacidad), 1)
                     else 0 end
    ),
    -- una fila por día del rango (incluye días en cero para que el gráfico no tenga huecos)
    'ingresos_diarios', (
      select coalesce(jsonb_agg(jsonb_build_object('fecha', d::date, 'ingresos', coalesce(v.ingresos, 0), 'reservas', coalesce(v.reservas, 0)) order by d), '[]')
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join (select fecha, sum(monto) ingresos, count(*) reservas from validas group by fecha) v on v.fecha = d::date
    ),
    'ocupacion_cancha', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'cancha', ca.nombre, 'complejo', ca.complejo,
               'horas', coalesce(h.horas, 0),
               'porcentaje', round(100 * coalesce(h.horas, 0)
                             / nullif(extract(epoch from (ca.hora_cierre - ca.hora_apertura)) / 3600 * (select n from dias), 0), 1)
             ) order by ca.complejo, ca.nombre), '[]')
      from ca
      left join (select cancha_id, sum(extract(epoch from (hora_fin - hora_inicio)) / 3600) horas
                 from validas group by cancha_id) h on h.cancha_id = ca.id
    ),
    -- horas pico: día de la semana (1 = lunes) × hora; una reserva de 2 h suma en 2 celdas
    'horas_pico', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'hora', hora, 'reservas', n)), '[]')
      from (
        select extract(isodow from v.fecha)::int dia, extract(hour from v.hora_inicio)::int + g.k hora, count(*) n
        from validas v
        cross join lateral generate_series(0, (extract(epoch from (v.hora_fin - v.hora_inicio)) / 3600)::int - 1) g(k)
        group by 1, 2
      ) t
    ),
    'por_complejo', (
      select coalesce(jsonb_agg(jsonb_build_object('complejo_id', cx.id, 'complejo', cx.nombre,
               'ingresos', coalesce(t.ingresos, 0), 'reservas', coalesce(t.reservas, 0)) order by t.ingresos desc nulls last), '[]')
      from cx left join (select complejo_id, sum(monto) ingresos, count(*) reservas from validas group by complejo_id) t
        on t.complejo_id = cx.id
    )
  );
$$;

revoke execute on function public.metricas(date, date, uuid) from public, anon;
grant execute on function public.metricas(date, date, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
