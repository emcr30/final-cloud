-- =====================================================================
-- CanchaYa · Migración 5: resumen del panel del jugador (Parte 4)
-- =====================================================================
-- La API REST devuelve como máximo 1000 filas por consulta, así que los
-- totales (gastado, reservas del mes) se calculan en la base de datos.
-- SECURITY INVOKER: corre con los permisos del jugador, por lo que RLS
-- sigue aplicando y además se filtra explícitamente por auth.uid().

create or replace function public.resumen_jugador()
returns table (total_gastado numeric, reservas_mes bigint, reservas_total bigint)
language sql stable security invoker set search_path = ''
as $$
  select
    coalesce(sum(r.monto) filter (where r.estado in ('pagada', 'completada')), 0),
    count(*) filter (
      where r.estado <> 'cancelada'
        and date_trunc('month', r.fecha) = date_trunc('month', (now() at time zone 'America/Lima')::date)
    ),
    count(*) filter (where r.estado <> 'cancelada')
  from public.reservas r
  where r.jugador_id = auth.uid();
$$;

grant execute on function public.resumen_jugador() to authenticated;
