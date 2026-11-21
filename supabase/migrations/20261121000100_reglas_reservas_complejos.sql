-- =====================================================================
-- CanchaYa · Migración 4: reglas del flujo del jugador (Parte 4)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El jugador solo puede cancelar si faltan MÁS de 2 horas para el inicio.
--    (La UI también lo controla, pero la regla real vive en la base.)
-- ---------------------------------------------------------------------
drop policy if exists "reservas: el jugador cancela las suyas" on public.reservas;

create policy "reservas: el jugador cancela las suyas"
  on public.reservas for update to authenticated
  using (
    jugador_id = (select auth.uid())
    and estado in ('pendiente_pago', 'pagada')
    and (fecha + hora_inicio) > (now() at time zone 'America/Lima') + interval '2 hours'
  )
  with check (jugador_id = (select auth.uid()) and estado = 'cancelada');

-- ---------------------------------------------------------------------
-- 2) Un propietario NO puede aprobarse solo ni pasar su complejo a otro dueño.
--    Ya lo impiden los permisos por columna de la migración 2 (`authenticated`
--    solo puede actualizar nombre, descripción, dirección, etc.). Este trigger
--    es una segunda barrera (defensa en profundidad) por si en el futuro se
--    amplían esos permisos. El backend (service role, auth.uid() nulo) sí
--    puede: así aprueba el admin en la Parte 7.
-- ---------------------------------------------------------------------
create or replace function public.proteger_campos_complejo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.mi_rol() is distinct from 'admin' then
    if new.estado is distinct from old.estado then
      raise exception 'Solo el administrador puede cambiar el estado del complejo';
    end if;
    if new.propietario_id is distinct from old.propietario_id then
      raise exception 'No se puede cambiar el dueño del complejo';
    end if;
  end if;
  return new;
end;
$$;

create trigger complejos_proteger_campos
  before update on public.complejos
  for each row execute function public.proteger_campos_complejo();
