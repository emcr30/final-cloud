-- =====================================================================
-- CanchaYa · Migración 3: vistas de métricas y Storage
-- =====================================================================
-- Las vistas usan security_invoker = on: se ejecutan con los permisos de quien
-- consulta, así que RLS filtra automáticamente. Un propietario solo ve las
-- métricas de SUS complejos y el admin ve las de toda la plataforma.
-- "Reserva que genera ingreso" = estado pagada o completada.

-- Ingresos por complejo y día
create view public.v_ingresos_diarios with (security_invoker = on) as
select
  x.id          as complejo_id,
  x.nombre      as complejo,
  r.fecha,
  count(*)      as reservas,
  sum(r.monto)  as ingresos
from public.reservas r
join public.canchas c   on c.id = r.cancha_id
join public.complejos x on x.id = c.complejo_id
where r.estado in ('pagada', 'completada')
group by x.id, x.nombre, r.fecha;

-- Ocupación por cancha y día: horas reservadas vs. horas que abre el complejo.
-- Para un rango de fechas: sumar horas_reservadas / sumar horas_abierto.
create view public.v_ocupacion_cancha with (security_invoker = on) as
select
  c.id     as cancha_id,
  c.nombre as cancha,
  x.id     as complejo_id,
  x.nombre as complejo,
  r.fecha,
  sum(extract(epoch from (r.hora_fin - r.hora_inicio)) / 3600)::numeric(6, 2)  as horas_reservadas,
  (extract(epoch from (x.hora_cierre - x.hora_apertura)) / 3600)::numeric(6, 2) as horas_abierto,
  round(100 * sum(extract(epoch from (r.hora_fin - r.hora_inicio)))
            / extract(epoch from (x.hora_cierre - x.hora_apertura)), 1)         as porcentaje
from public.reservas r
join public.canchas c   on c.id = r.cancha_id
join public.complejos x on x.id = c.complejo_id
where r.estado in ('pagada', 'completada')
group by c.id, c.nombre, x.id, x.nombre, x.hora_apertura, x.hora_cierre, r.fecha;

-- Cantidad de reservas por estado (por complejo y día, para filtrar por rango)
create view public.v_reservas_por_estado with (security_invoker = on) as
select
  x.id     as complejo_id,
  r.fecha,
  r.estado,
  count(*) as cantidad
from public.reservas r
join public.canchas c   on c.id = r.cancha_id
join public.complejos x on x.id = c.complejo_id
group by x.id, r.fecha, r.estado;

-- Horas pico: cuántas horas-cancha se reservan por día de la semana y hora.
-- Una reserva de 2 h (19:00-21:00) suma en las horas 19 y 20.
-- dia_semana: 1 = lunes ... 7 = domingo (ISO). Sirve para el heatmap día × hora.
create view public.v_horas_pico with (security_invoker = on) as
select
  x.id                                     as complejo_id,
  extract(isodow from r.fecha)::int        as dia_semana,
  (extract(hour from r.hora_inicio)::int + h.n) as hora,
  count(*)                                 as reservas
from public.reservas r
join public.canchas c   on c.id = r.cancha_id
join public.complejos x on x.id = c.complejo_id
cross join lateral generate_series(
  0, (extract(epoch from (r.hora_fin - r.hora_inicio)) / 3600)::int - 1
) as h(n)
where r.estado <> 'cancelada'
group by x.id, dia_semana, hora;

-- Las métricas no son públicas
revoke all on public.v_ingresos_diarios, public.v_ocupacion_cancha,
              public.v_reservas_por_estado, public.v_horas_pico from anon;

-- ---------------------------------------------------------------------
-- Storage: bucket público 'complejos' para fotos
-- Lectura pública por URL; subir/editar solo propietarios y admin.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complejos', 'complejos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "complejos: lectura pública de fotos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'complejos');

create policy "complejos: propietarios y admin suben fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'complejos' and (select public.mi_rol()) in ('propietario', 'admin'));

create policy "complejos: el autor o el admin actualiza fotos"
  on storage.objects for update to authenticated
  using (bucket_id = 'complejos'
         and (owner_id = (select auth.uid())::text or (select public.mi_rol()) = 'admin'));

create policy "complejos: el autor o el admin elimina fotos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'complejos'
         and (owner_id = (select auth.uid())::text or (select public.mi_rol()) = 'admin'));
