-- =====================================================================
-- CanchaYa · Migración 7: configuración de la plataforma (Parte 7)
-- =====================================================================
-- Una sola fila (id = 1) con los parámetros que el admin puede cambiar
-- desde su panel sin redesplegar:
--  * comision_pct: comisión simulada que cobra la plataforma sobre cada reserva.
--  * minutos_expiracion: minutos que una reserva puede quedar "pendiente_pago"
--    antes de que la limpieza automática la cancele (la lee el backend).

create table public.configuracion (
  id                 int primary key default 1 check (id = 1),  -- garantiza una sola fila
  comision_pct       numeric(5, 2) not null default 10 check (comision_pct between 0 and 50),
  minutos_expiracion int not null default 15 check (minutos_expiracion between 5 and 120),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id) on delete set null
);
comment on table public.configuracion is 'Parámetros de la plataforma (una sola fila). Solo el admin los lee y cambia.';

insert into public.configuracion (id) values (1) on conflict do nothing;

-- Al guardar, registra cuándo y quién cambió la configuración
create or replace function public.configuracion_auditoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger configuracion_auditoria
  before update on public.configuracion
  for each row execute function public.configuracion_auditoria();

-- Privilegios: nadie inserta ni borra (la fila ya existe); solo se actualizan dos columnas
revoke all on public.configuracion from anon;
revoke insert, update, delete on public.configuracion from authenticated;
grant select on public.configuracion to authenticated;
grant update (comision_pct, minutos_expiracion) on public.configuracion to authenticated;

alter table public.configuracion enable row level security;

create policy "configuracion: solo admin la lee"
  on public.configuracion for select to authenticated
  using ((select public.mi_rol()) = 'admin');

create policy "configuracion: solo admin la cambia"
  on public.configuracion for update to authenticated
  using ((select public.mi_rol()) = 'admin')
  with check ((select public.mi_rol()) = 'admin');

-- Igual que el resto: el admin necesita sesión con MFA (aal2)
create policy "mfa: admin y propietario requieren aal2" on public.configuracion
  as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

notify pgrst, 'reload schema';
