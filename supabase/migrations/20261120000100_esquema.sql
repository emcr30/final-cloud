-- =====================================================================
-- CanchaYa · Migración 1: esquema (enums, tablas, restricciones, índices)
-- =====================================================================
-- Modelo multi-tenant: cada COMPLEJO es un tenant. Sus canchas y reservas
-- cuelgan de él, y las políticas RLS (migración 2) aíslan los datos.

-- btree_gist permite combinar "=" (uuid) con "&&" (rangos) en una restricción EXCLUDE
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.rol_usuario       as enum ('admin', 'propietario', 'jugador');
create type public.estado_complejo   as enum ('pendiente', 'activo', 'suspendido');
create type public.tipo_cancha       as enum ('futbol5', 'futbol7', 'futbol11');
create type public.superficie_cancha as enum ('sintetico', 'natural', 'losa');
create type public.estado_reserva    as enum ('pendiente_pago', 'pagada', 'cancelada', 'completada');
create type public.estado_pago       as enum ('pagado', 'fallido', 'reembolsado');

-- ---------------------------------------------------------------------
-- profiles: datos públicos del usuario (1 a 1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null default '',
  telefono   text,
  rol        public.rol_usuario not null default 'jugador',
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada usuario. El rol solo lo cambia el backend (service role).';

-- ---------------------------------------------------------------------
-- complejos: el TENANT. propietario_id puede ser NULL solo para datos de seed
-- todavía sin dueño asignado.
-- ---------------------------------------------------------------------
create table public.complejos (
  id             uuid primary key default gen_random_uuid(),
  propietario_id uuid references public.profiles (id) on delete set null,
  nombre         text not null check (length(trim(nombre)) > 0),
  descripcion    text,
  direccion      text not null,
  distrito       text not null,
  lat            double precision check (lat between -90 and 90),
  lng            double precision check (lng between -180 and 180),
  foto_url       text,
  hora_apertura  time not null default '08:00',
  hora_cierre    time not null default '23:00',
  estado         public.estado_complejo not null default 'pendiente',
  created_at     timestamptz not null default now(),
  constraint complejos_horario_valido check (hora_cierre > hora_apertura)
);
create index complejos_propietario_idx on public.complejos (propietario_id);
create index complejos_estado_idx      on public.complejos (estado);

-- ---------------------------------------------------------------------
-- canchas
-- ---------------------------------------------------------------------
create table public.canchas (
  id          uuid primary key default gen_random_uuid(),
  complejo_id uuid not null references public.complejos (id) on delete cascade,
  nombre      text not null,
  tipo        public.tipo_cancha not null default 'futbol7',
  superficie  public.superficie_cancha not null default 'sintetico',
  precio_hora numeric(10, 2) not null check (precio_hora > 0),
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index canchas_complejo_idx on public.canchas (complejo_id);

-- ---------------------------------------------------------------------
-- reservas: bloques de horas completas en una cancha
-- ---------------------------------------------------------------------
create table public.reservas (
  id                   uuid primary key default gen_random_uuid(),
  cancha_id            uuid not null references public.canchas (id) on delete cascade,
  jugador_id           uuid not null references public.profiles (id) on delete cascade,
  fecha                date not null,
  hora_inicio          time not null,
  hora_fin             time not null,
  monto                numeric(10, 2) not null default 0 check (monto >= 0),
  estado               public.estado_reserva not null default 'pendiente_pago',
  stripe_session_id    text unique,
  recordatorio_enviado boolean not null default false,
  created_at           timestamptz not null default now(),
  constraint reservas_horas_validas check (hora_fin > hora_inicio),
  -- Solo horas en punto (08:00, 09:00, ...)
  constraint reservas_horas_en_punto check (
    extract(minute from hora_inicio) = 0 and extract(second from hora_inicio) = 0
    and extract(minute from hora_fin) = 0 and extract(second from hora_fin) = 0
  ),
  -- Sin solapamientos: en la misma cancha no puede haber dos reservas vigentes
  -- cuyos rangos [inicio, fin) se crucen. Las canceladas no cuentan.
  constraint reservas_sin_solapamiento exclude using gist (
    cancha_id with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  ) where (estado <> 'cancelada')
);
create index reservas_cancha_fecha_idx on public.reservas (cancha_id, fecha);
create index reservas_jugador_idx      on public.reservas (jugador_id);
create index reservas_estado_idx       on public.reservas (estado);

-- ---------------------------------------------------------------------
-- pagos: un registro por Checkout Session de Stripe pagada (idempotente)
-- ---------------------------------------------------------------------
create table public.pagos (
  id                    uuid primary key default gen_random_uuid(),
  reserva_id            uuid not null references public.reservas (id) on delete cascade,
  monto                 numeric(10, 2) not null check (monto > 0),
  moneda                text not null default 'pen',
  stripe_session_id     text unique,
  stripe_payment_intent text,
  estado                public.estado_pago not null default 'pagado',
  created_at            timestamptz not null default now()
);
create index pagos_reserva_idx on public.pagos (reserva_id);

-- ---------------------------------------------------------------------
-- notificaciones_log: auditoría de correos enviados (confirmación, recordatorio)
-- ---------------------------------------------------------------------
create table public.notificaciones_log (
  id           uuid primary key default gen_random_uuid(),
  reserva_id   uuid references public.reservas (id) on delete set null,
  tipo         text not null,          -- 'confirmacion' | 'recordatorio'
  destinatario text not null,
  estado       text not null,          -- 'enviado' | 'error' | 'dry_run'
  detalle      text,
  created_at   timestamptz not null default now()
);
create index notificaciones_reserva_idx on public.notificaciones_log (reserva_id);

-- ---------------------------------------------------------------------
-- Trigger de integridad de reservas
--  * Calcula el monto en el servidor (el cliente no puede inventar el precio).
--  * Verifica que la cancha/complejo estén activos y que el horario esté dentro
--    de la atención del complejo.
--  * Para usuarios de la app (auth.uid() no nulo) impide reservar en el pasado.
--    El seed y el backend (service role, auth.uid() nulo) sí pueden.
-- ---------------------------------------------------------------------
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

  if tg_op = 'INSERT' and (not v_activa or v_estado <> 'activo') then
    raise exception 'La cancha no está disponible para reservas';
  end if;

  if new.hora_inicio < v_apertura or new.hora_fin > v_cierre then
    raise exception 'El horario está fuera de la atención del complejo (% - %)', v_apertura, v_cierre;
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null
     and (new.fecha + new.hora_inicio) < (now() at time zone 'America/Lima') then
    raise exception 'No se puede reservar en el pasado';
  end if;

  -- Precio por hora × número de horas
  new.monto := v_precio * extract(epoch from (new.hora_fin - new.hora_inicio)) / 3600;
  return new;
end;
$$;

create trigger reservas_validar
  before insert or update of cancha_id, fecha, hora_inicio, hora_fin
  on public.reservas
  for each row execute function public.validar_reserva();
