-- =====================================================================
-- CanchaYa · Prueba de aislamiento multi-tenant (RLS)
-- =====================================================================
-- Simula ser cada usuario (como hace PostgREST): cambia al rol
-- "authenticated" y pone los claims del JWT (sub = id del usuario, aal).
-- Todo corre dentro de una transacción que termina en ROLLBACK:
-- no cambia ningún dato aunque un intento de escritura "pasara".
--
-- Ejecutar:
--   supabase db query --remote -f supabase/tests/aislamiento_multitenant.sql
-- Resultado: una tabla prueba | esperado | obtenido | ok. Todas deben ser ok = true.
--
-- Datos del seed: propietario1 → complejos ...0001-0003, propietario2 → ...0004-0005.
-- =====================================================================
begin;

create temp table resultados (n serial, prueba text, esperado text, obtenido text, ok boolean);
create temp table ids as
select
  (select id from auth.users where email = 'propietario1@canchaya.demo') as prop1,
  (select id from auth.users where email = 'propietario2@canchaya.demo') as prop2,
  (select id from auth.users where email = 'jugador@canchaya.demo')      as jugador,
  (select c.id from public.canchas c join public.complejos x on x.id = c.complejo_id
     join auth.users u on u.id = x.propietario_id
    where u.email = 'propietario2@canchaya.demo' order by c.nombre limit 1) as cancha_p2,
  (select x.id from public.complejos x join auth.users u on u.id = x.propietario_id
    where u.email = 'propietario2@canchaya.demo' order by x.nombre limit 1) as complejo_p2,
  (select r.id from public.reservas r join public.canchas c on c.id = r.cancha_id
     join public.complejos x on x.id = c.complejo_id join auth.users u on u.id = x.propietario_id
    where u.email = 'propietario2@canchaya.demo' and r.estado = 'pagada' limit 1) as reserva_p2;
grant all on resultados, ids to authenticated, anon;
grant usage on sequence resultados_n_seq to authenticated, anon;

-- ---------------------------------------------------------------------
-- A) propietario1 con MFA (aal2) intenta ver y tocar datos de propietario2
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select prop1 from ids), 'role', 'authenticated', 'aal', 'aal2')::text, true);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 ve sus propias reservas (control)', '> 0', count(*)::text, count(*) > 0
from public.reservas r join public.canchas c on c.id = r.cancha_id join public.complejos x on x.id = c.complejo_id
where x.propietario_id = (select prop1 from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 ve reservas de complejos de P2', '0', count(*)::text, count(*) = 0
from public.reservas r join public.canchas c on c.id = r.cancha_id join public.complejos x on x.id = c.complejo_id
where x.propietario_id = (select prop2 from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 ve reservas de cualquier complejo ajeno', '0', count(*)::text, count(*) = 0
from public.reservas r
where not public.es_propietario_de_cancha(r.cancha_id) and r.jugador_id <> (select prop1 from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 ve pagos de reservas de P2', '0', count(*)::text, count(*) = 0
from public.pagos p join public.reservas r on r.id = p.reserva_id
where r.cancha_id in (select c.id from public.canchas c where c.complejo_id in
  (select x.id from public.complejos x where x.propietario_id = (select prop2 from ids)));

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 ve ingresos (v_ingresos_diarios) de P2', '0', count(*)::text, count(*) = 0
from public.v_ingresos_diarios v
where v.complejo_id in (select x.id from public.complejos x where x.propietario_id = (select prop2 from ids));

insert into resultados (prueba, esperado, obtenido, ok)
select 'metricas() de P1 solo trae sus 3 complejos', '3',
       jsonb_array_length(m -> 'por_complejo')::text, jsonb_array_length(m -> 'por_complejo') = 3
from (select public.metricas(current_date - 30, current_date, null) m) t;

insert into resultados (prueba, esperado, obtenido, ok)
select 'metricas() pidiendo un complejo de P2', '0 reservas',
       (m -> 'resumen' ->> 'reservas') || ' reservas', (m -> 'resumen' ->> 'reservas')::int = 0
from (select public.metricas(current_date - 30, current_date, (select complejo_p2 from ids)) m) t;

with u as (update public.canchas set precio_hora = 1 where id = (select cancha_p2 from ids) returning 1)
insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 cambia el precio de una cancha de P2', '0 filas', count(*) || ' filas', count(*) = 0 from u;

with u as (update public.complejos set nombre = 'HACKEADO' where id = (select complejo_p2 from ids) returning 1)
insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 edita un complejo de P2', '0 filas', count(*) || ' filas', count(*) = 0 from u;

with u as (update public.reservas set estado = 'cancelada' where id = (select reserva_p2 from ids) returning 1)
insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 cancela una reserva de P2', '0 filas', count(*) || ' filas', count(*) = 0 from u;

with u as (delete from public.canchas where id = (select cancha_p2 from ids) returning 1)
insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 elimina una cancha de P2', '0 filas', count(*) || ' filas', count(*) = 0 from u;

do $$
begin
  insert into public.canchas (complejo_id, nombre, tipo, superficie, precio_hora)
  values ((select complejo_p2 from ids), 'Intrusa', 'futbol5', 'losa', 10);
  insert into resultados (prueba, esperado, obtenido, ok) values ('P1 crea una cancha en un complejo de P2', 'error RLS', 'insertó', false);
exception when others then
  insert into resultados (prueba, esperado, obtenido, ok) values ('P1 crea una cancha en un complejo de P2', 'error RLS', sqlstate || ' ' || left(sqlerrm, 60), true);
end $$;

do $$
begin
  insert into public.reservas (cancha_id, jugador_id, fecha, hora_inicio, hora_fin, estado, es_bloqueo)
  values ((select cancha_p2 from ids), (select prop1 from ids), current_date + 3, '09:00', '10:00', 'pagada', true);
  insert into resultados (prueba, esperado, obtenido, ok) values ('P1 bloquea un horario en una cancha de P2', 'error RLS', 'insertó', false);
exception when others then
  insert into resultados (prueba, esperado, obtenido, ok) values ('P1 bloquea un horario en una cancha de P2', 'error RLS', sqlstate || ' ' || left(sqlerrm, 60), true);
end $$;

-- ---------------------------------------------------------------------
-- B) propietario2 (aal2) intenta ver datos de propietario1
-- ---------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select prop2 from ids), 'role', 'authenticated', 'aal', 'aal2')::text, true);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P2 ve sus propias reservas (control)', '> 0', count(*)::text, count(*) > 0
from public.reservas r join public.canchas c on c.id = r.cancha_id join public.complejos x on x.id = c.complejo_id
where x.propietario_id = (select prop2 from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P2 ve reservas de complejos de P1', '0', count(*)::text, count(*) = 0
from public.reservas r join public.canchas c on c.id = r.cancha_id join public.complejos x on x.id = c.complejo_id
where x.propietario_id = (select prop1 from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'metricas() de P2 solo trae sus 2 complejos', '2',
       jsonb_array_length(m -> 'por_complejo')::text, jsonb_array_length(m -> 'por_complejo') = 2
from (select public.metricas(current_date - 30, current_date, null) m) t;

-- ---------------------------------------------------------------------
-- C) MFA en la base: propietario1 SIN segundo factor (aal1)
-- ---------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select prop1 from ids), 'role', 'authenticated', 'aal', 'aal1')::text, true);

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 con solo contraseña (aal1) ve reservas', '0', count(*)::text, count(*) = 0 from public.reservas;

insert into resultados (prueba, esperado, obtenido, ok)
select 'P1 con solo contraseña (aal1) ve pagos', '0', count(*)::text, count(*) = 0 from public.pagos;

-- ---------------------------------------------------------------------
-- D) Jugador y visitante anónimo
-- ---------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select jugador from ids), 'role', 'authenticated', 'aal', 'aal1')::text, true);

insert into resultados (prueba, esperado, obtenido, ok)
select 'Jugador ve reservas de otros jugadores', '0', count(*)::text, count(*) = 0
from public.reservas where jugador_id <> (select jugador from ids);

insert into resultados (prueba, esperado, obtenido, ok)
select 'Jugador lee el log de notificaciones', '0', count(*)::text, count(*) = 0 from public.notificaciones_log;

do $$
begin
  insert into public.reservas (cancha_id, jugador_id, fecha, hora_inicio, hora_fin, estado, es_bloqueo)
  values ((select cancha_p2 from ids), (select jugador from ids), current_date + 3, '09:00', '10:00', 'pagada', true);
  insert into resultados (prueba, esperado, obtenido, ok) values ('Jugador crea una reserva "pagada" sin pagar', 'error RLS', 'insertó', false);
exception when others then
  insert into resultados (prueba, esperado, obtenido, ok) values ('Jugador crea una reserva "pagada" sin pagar', 'error RLS', sqlstate || ' ' || left(sqlerrm, 60), true);
end $$;

do $$
begin
  update public.profiles set rol = 'admin' where id = (select jugador from ids);
  insert into resultados (prueba, esperado, obtenido, ok) values ('Jugador se cambia el rol a admin', 'error permisos', 'actualizó', false);
exception when others then
  insert into resultados (prueba, esperado, obtenido, ok) values ('Jugador se cambia el rol a admin', 'error permisos', sqlstate || ' ' || left(sqlerrm, 60), true);
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into resultados (prueba, esperado, obtenido, ok)
select 'Anónimo ve reservas', '0', count(*)::text, count(*) = 0 from public.reservas;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Anónimo ve complejos activos (catálogo público)', '> 0', count(*)::text, count(*) > 0 from public.complejos;

reset role;
select n, prueba, esperado, obtenido, ok from resultados order by n;
rollback;
