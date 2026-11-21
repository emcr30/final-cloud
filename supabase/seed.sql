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
-- Complejos (IDs fijos para poder referenciarlos) — Lima, coordenadas aproximadas
-- ---------------------------------------------------------------------
insert into public.complejos
  (id, nombre, descripcion, direccion, distrito, lat, lng, hora_apertura, hora_cierre, estado)
values
  ('c0000000-0000-4000-8000-000000000001', 'La Bombonera de Surco',
   'Canchas sintéticas techadas, vestuarios con duchas y estacionamiento propio.',
   'Av. Caminos del Inca 1450', 'Santiago de Surco', -12.1290, -76.9940, '08:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000002', 'Miraflores Fútbol Club',
   'A dos cuadras del Parque Kennedy. Césped sintético de última generación e iluminación LED.',
   'Calle Juan Fanning 520', 'Miraflores', -12.1255, -77.0240, '07:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000003', 'San Borja Sport Center',
   'Complejo familiar con cancha de grass natural para fútbol 11 y cafetería.',
   'Av. San Borja Norte 1050', 'San Borja', -12.0920, -77.0000, '08:00', '22:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000004', 'Los Olivos Arena',
   'Canchas de fútbol 5 y 7 a precios accesibles, ideal para pichangas de la semana.',
   'Av. Carlos Izaguirre 900', 'Los Olivos', -11.9900, -77.0700, '09:00', '23:00', 'activo'),
  ('c0000000-0000-4000-8000-000000000005', 'SJL Gol Center',
   'El complejo más grande de San Juan de Lurigancho: losa y sintético, torneos los domingos.',
   'Av. Próceres de la Independencia 2100', 'San Juan de Lurigancho', -11.9950, -77.0050, '08:00', '23:00', 'activo')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Canchas (2-3 por complejo, precios entre 60 y 150 PEN por hora)
-- ---------------------------------------------------------------------
insert into public.canchas (id, complejo_id, nombre, tipo, superficie, precio_hora) values
  ('ca000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000001', 'Cancha 1', 'futbol7', 'sintetico', 120),
  ('ca000000-0000-4000-8000-000000000102', 'c0000000-0000-4000-8000-000000000001', 'Cancha 2', 'futbol5', 'sintetico',  80),
  ('ca000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000001', 'Cancha 3', 'futbol5', 'sintetico',  80),
  ('ca000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000002', 'Cancha Principal', 'futbol7', 'sintetico', 150),
  ('ca000000-0000-4000-8000-000000000202', 'c0000000-0000-4000-8000-000000000002', 'Cancha Chica',     'futbol5', 'sintetico', 100),
  ('ca000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000003', 'Estadio',  'futbol11', 'natural',   150),
  ('ca000000-0000-4000-8000-000000000302', 'c0000000-0000-4000-8000-000000000003', 'Cancha B', 'futbol7',  'sintetico', 110),
  ('ca000000-0000-4000-8000-000000000401', 'c0000000-0000-4000-8000-000000000004', 'Cancha A', 'futbol5', 'sintetico', 70),
  ('ca000000-0000-4000-8000-000000000402', 'c0000000-0000-4000-8000-000000000004', 'Cancha B', 'futbol7', 'sintetico', 90),
  ('ca000000-0000-4000-8000-000000000403', 'c0000000-0000-4000-8000-000000000004', 'Losa',     'futbol5', 'losa',      60),
  ('ca000000-0000-4000-8000-000000000501', 'c0000000-0000-4000-8000-000000000005', 'Sintética 1', 'futbol7', 'sintetico', 85),
  ('ca000000-0000-4000-8000-000000000502', 'c0000000-0000-4000-8000-000000000005', 'Losa Central', 'futbol5', 'losa',   60)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- seed_asociar_demo(): se llama cuando ya existen los usuarios demo.
--  * propietario1@canchaya.demo → Surco, Miraflores, San Borja
--  * propietario2@canchaya.demo → Los Olivos, SJL
--  * jugador@canchaya.demo      → reservas de las últimas 4 semanas + próximos días
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
  v_hoy     date := (now() at time zone 'America/Lima')::date;
  v_n       int;
begin
  select id into v_prop1   from auth.users where email = 'propietario1@canchaya.demo';
  select id into v_prop2   from auth.users where email = 'propietario2@canchaya.demo';
  select id into v_jugador from auth.users where email = 'jugador@canchaya.demo';

  if v_prop1 is null or v_prop2 is null or v_jugador is null then
    return 'Usuarios demo aún no creados: ejecuta scripts/crear_usuarios_demo.py';
  end if;

  -- Asignar complejos (tenants) a sus dueños
  update public.complejos set propietario_id = v_prop1
  where id in ('c0000000-0000-4000-8000-000000000001',
               'c0000000-0000-4000-8000-000000000002',
               'c0000000-0000-4000-8000-000000000003');
  update public.complejos set propietario_id = v_prop2
  where id in ('c0000000-0000-4000-8000-000000000004',
               'c0000000-0000-4000-8000-000000000005');

  -- Reservas: solo la primera vez
  if exists (select 1 from public.reservas where jugador_id = v_jugador) then
    return 'Complejos asignados; las reservas demo ya existían';
  end if;

  perform setseed(0.42);  -- aleatorio pero reproducible

  -- Por cada cancha, día y hora decide al azar si hubo reserva de 1 hora.
  -- Más probabilidad de 18:00 a 22:00 y en fin de semana (horas pico).
  insert into public.reservas (cancha_id, jugador_id, fecha, hora_inicio, hora_fin, estado, recordatorio_enviado)
  select
    c.id, v_jugador, d::date, make_time(h, 0, 0), make_time(h + 1, 0, 0),
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
  where r.jugador_id = v_jugador and r.estado in ('pagada', 'completada')
  on conflict (stripe_session_id) do nothing;

  select count(*) into v_n from public.reservas where jugador_id = v_jugador;
  return format('Complejos asignados y %s reservas demo creadas', v_n);
end;
$$;

revoke execute on function public.seed_asociar_demo() from public, anon, authenticated;
grant execute on function public.seed_asociar_demo() to service_role;

-- Si los usuarios ya existen (re-ejecución del seed), asocia de una vez
select public.seed_asociar_demo();

-- Que la API REST (PostgREST) vea la nueva función RPC sin esperar
notify pgrst, 'reload schema';
