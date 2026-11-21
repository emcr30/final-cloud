-- =====================================================================
-- CanchaYa · Datos de prueba (seed)
-- =====================================================================
-- Orden de uso:
--   1. `supabase db push --include-seed`  → crea complejos y canchas (sin dueño)
--   2. `python scripts/crear_usuarios_demo.py` → crea los usuarios demo, les da
--      su rol y llama a public.seed_asociar_demo(), que asigna los complejos a
--      los propietarios y genera ~4 semanas de reservas para el dashboard.
-- Todo es idempotente: se puede ejecutar varias veces sin duplicar datos.

-- ---------------------------------------------------------------------
-- Complejos (IDs fijos para poder referenciarlos) — Arequipa, coordenadas aproximadas
-- ---------------------------------------------------------------------
insert into public.complejos
  (id, nombre, descripcion, direccion, distrito, lat, lng, hora_apertura, hora_cierre, estado)
values
  ('c0000000-0000-4000-8000-000000000001', 'Yanahuara Fútbol Club',
   'A pasos del mirador de Yanahuara. Canchas sintéticas techadas, vestuarios con duchas y estacionamiento.',
   'Av. Ejército 710', 'Yanahuara', -16.3895, -71.5440, '08:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000002', 'Cayma Sport Center',
   'Césped sintético de última generación, iluminación LED y vista al Misti.',
   'Av. Cayma 450', 'Cayma', -16.3720, -71.5420, '07:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000003', 'La Campiña de Sachaca',
   'Complejo campestre con cancha de grass natural para fútbol 11, picantería y área para niños.',
   'Av. Fernandini 300', 'Sachaca', -16.4250, -71.5650, '08:00', '22:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000004', 'Bustamante Arena',
   'Canchas de fútbol 5 y 7 a precios accesibles, ideal para las pichangas de la semana.',
   'Av. Dolores 1200', 'José Luis Bustamante y Rivero', -16.4180, -71.5170, '09:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000005', 'Cerro Colorado Gol Center',
   'El complejo más grande del cono norte: losa y sintético, torneos los domingos.',
   'Av. Aviación 1500', 'Cerro Colorado', -16.3640, -71.5600, '08:00', '23:00', 'activo')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Canchas (2-3 por complejo, precios entre 60 y 150 PEN por hora).
-- Llevan nombres de los volcanes y lugares de Arequipa.
-- ---------------------------------------------------------------------
insert into public.canchas (id, complejo_id, nombre, tipo, superficie, precio_hora) values
  ('ca000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000001', 'Cancha Misti',       'futbol7', 'sintetico', 120),
  ('ca000000-0000-4000-8000-000000000102', 'c0000000-0000-4000-8000-000000000001', 'Cancha Chachani',    'futbol5', 'sintetico',  80),
  ('ca000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000001', 'Cancha Pichu Pichu', 'futbol5', 'sintetico',  80),
  ('ca000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000002', 'Cancha Principal',   'futbol7', 'sintetico', 150),
  ('ca000000-0000-4000-8000-000000000202', 'c0000000-0000-4000-8000-000000000002', 'Cancha Sillar',      'futbol5', 'sintetico', 100),
  ('ca000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000003', 'Estadio La Campiña', 'futbol11', 'natural',  150),
  ('ca000000-0000-4000-8000-000000000302', 'c0000000-0000-4000-8000-000000000003', 'Cancha Chili',       'futbol7', 'sintetico', 110),
  ('ca000000-0000-4000-8000-000000000401', 'c0000000-0000-4000-8000-000000000004', 'Cancha A',           'futbol5', 'sintetico',  70),
  ('ca000000-0000-4000-8000-000000000402', 'c0000000-0000-4000-8000-000000000004', 'Cancha B',           'futbol7', 'sintetico',  90),
  ('ca000000-0000-4000-8000-000000000403', 'c0000000-0000-4000-8000-000000000004', 'Losa',               'futbol5', 'losa',       60),
  ('ca000000-0000-4000-8000-000000000501', 'c0000000-0000-4000-8000-000000000005', 'Cancha Ampato',      'futbol7', 'sintetico',  85),
  ('ca000000-0000-4000-8000-000000000502', 'c0000000-0000-4000-8000-000000000005', 'Losa Central',       'futbol5', 'losa',       60)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- seed_asociar_demo(): se llama cuando ya existen los usuarios demo.
--  * propietario1@canchaya.demo → Yanahuara, Cayma, Sachaca
--  * propietario2@canchaya.demo → Bustamante y Rivero, Cerro Colorado
--  * jugador@canchaya.demo y los demás jugadores demo (peeta@, gale@, ...)
--                                → reservas de las últimas 4 semanas + próximos días,
--                                  repartidas al azar entre ellos
-- Solo la service role puede ejecutarla.
-- ---------------------------------------------------------------------
create or replace function public.seed_asociar_demo()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop1   uuid;
  v_prop2   uuid;
  v_jugador uuid;
  v_jugadores uuid[];  -- todos los jugadores demo (@canchaya.demo, rol jugador, sin QA)
  v_hoy     date := (now() at time zone 'America/Lima')::date;  -- Arequipa usa la misma zona horaria
  v_n       int;
begin
  select id into v_prop1   from auth.users where email = 'propietario1@canchaya.demo';
  select id into v_prop2   from auth.users where email = 'propietario2@canchaya.demo';
  select id into v_jugador from auth.users where email = 'jugador@canchaya.demo';

  if v_prop1 is null or v_prop2 is null or v_jugador is null then
    return 'Usuarios demo aún no creados: ejecuta scripts/crear_usuarios_demo.py';
  end if;

  select array_agg(p.id order by u.email) into v_jugadores
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.rol = 'jugador' and u.email like '%@canchaya.demo' and u.email not like 'qa.%';

  -- Asignar complejos (tenants) a sus dueños
  update public.complejos set propietario_id = v_prop1
  where id in ('c0000000-0000-4000-8000-000000000001',
               'c0000000-0000-4000-8000-000000000002',
               'c0000000-0000-4000-8000-000000000003');
  update public.complejos set propietario_id = v_prop2
  where id in ('c0000000-0000-4000-8000-000000000004',
               'c0000000-0000-4000-8000-000000000005');

  -- Reservas: solo la primera vez
  if exists (select 1 from public.reservas where jugador_id = any (v_jugadores)) then
    return 'Complejos asignados; las reservas demo ya existían';
  end if;

  perform setseed(0.42);  -- aleatorio pero reproducible

  -- Por cada cancha, día y hora decide al azar si hubo reserva de 1 hora.
  -- Más probabilidad de 18:00 a 22:00 y en fin de semana (horas pico).
  insert into public.reservas (cancha_id, jugador_id, fecha, hora_inicio, hora_fin, estado, recordatorio_enviado)
  select
    c.id,
    v_jugadores[1 + floor(random() * array_length(v_jugadores, 1))::int],  -- un jugador demo al azar
    d::date, make_time(h, 0, 0), make_time(h + 1, 0, 0),
    case
      when d::date >= v_hoy then 'pagada'::public.estado_reserva
      when random() < 0.08  then 'cancelada'::public.estado_reserva
      else 'completada'::public.estado_reserva
    end,
    d::date < v_hoy
  from public.canchas c
  join public.complejos x on x.id = c.complejo_id
  cross join generate_series(v_hoy - 28, v_hoy + 6, interval '1 day') as d
  cross join generate_series(extract(hour from x.hora_apertura)::int,
                             extract(hour from x.hora_cierre)::int - 1) as h
  where random() < (
          case when h between 18 and 21 then 0.60
               when h between 12 and 17 then 0.25
               else 0.10 end
          + case when extract(isodow from d) in (6, 7) then 0.15 else 0 end
        ) * case when d::date >= v_hoy then 0.25 else 1 end  -- futuro: menos reservas
    and d::date <> v_hoy  -- hoy se deja libre para reservar en la demo
  on conflict do nothing;

  -- Asegura una reserva pagada para MAÑANA (demo del recordatorio por correo)
  insert into public.reservas (cancha_id, jugador_id, fecha, hora_inicio, hora_fin, estado)
  values ('ca000000-0000-4000-8000-000000000101', v_jugador, v_hoy + 1, '20:00', '21:00', 'pagada')
  on conflict do nothing;

  -- Un pago por cada reserva pagada/completada (IDs de Stripe ficticios)
  insert into public.pagos (reserva_id, monto, moneda, stripe_session_id, stripe_payment_intent, estado, created_at)
  select r.id, r.monto, 'pen', 'cs_test_seed_' || r.id, 'pi_seed_' || left(r.id::text, 8), 'pagado',
         (r.fecha - 1) + time '12:00'
  from public.reservas r
  where r.jugador_id = any (v_jugadores) and r.estado in ('pagada', 'completada')
  on conflict (stripe_session_id) do nothing;

  select count(*) into v_n from public.reservas where jugador_id = any (v_jugadores);
  return format('Complejos asignados y %s reservas demo creadas', v_n);
end;
$$;

revoke execute on function public.seed_asociar_demo() from public, anon, authenticated;
grant execute on function public.seed_asociar_demo() to service_role;

-- Si los usuarios ya existen (re-ejecución del seed), asocia de una vez
select public.seed_asociar_demo();

-- Que la API REST (PostgREST) vea la nueva función RPC sin esperar
notify pgrst, 'reload schema';
