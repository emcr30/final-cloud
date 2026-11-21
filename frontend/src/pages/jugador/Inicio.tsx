import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarDays, MapPin, Search, Wallet, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Cargando } from '../../components/ui'
import BadgeEstado from '../../components/BadgeEstado'
import { SELECT_RESERVA, fechaLarga, hhmm, hoyLima, instanteLima, soles, type ReservaDetalle } from '../../lib/canchas'

/** Fila que devuelve la función resumen_jugador() de Postgres. */
interface Resumen { total_gastado: number; reservas_mes: number; reservas_total: number }

function Tarjeta({ icono: Icono, titulo, valor }: { icono: LucideIcon; titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="flex items-center gap-2 text-sm text-gray-500"><Icono size={16} /> {titulo}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{valor}</p>
    </div>
  )
}

/** /jugador: resumen con próxima reserva, total gastado y reservas del mes. */
export default function JugadorInicio() {
  const { session, perfil } = useAuth()
  const [proxima, setProxima] = useState<ReservaDetalle | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  useEffect(() => {
    // Reservas vigentes desde hoy, para encontrar la siguiente que aún no empieza
    supabase
      .from('reservas')
      .select(SELECT_RESERVA)
      .eq('jugador_id', session!.user.id)
      .in('estado', ['pagada', 'pendiente_pago'])
      .gte('fecha', hoyLima())
      .order('fecha')
      .order('hora_inicio')
      .limit(10)
      .then(({ data }) => {
        const ahora = Date.now()
        const lista = (data ?? []) as unknown as ReservaDetalle[]
        setProxima(lista.find((r) => instanteLima(r.fecha, r.hora_inicio).getTime() > ahora) ?? null)
      })

    // Totales calculados en Postgres (la API limita las consultas a 1000 filas)
    supabase.rpc('resumen_jugador').single().then(({ data }) => {
      setResumen((data as Resumen | null) ?? { total_gastado: 0, reservas_mes: 0, reservas_total: 0 })
    })
  }, [session])

  if (!resumen) return <Cargando />

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-gray-500">Hola, {perfil?.nombre.split(' ')[0]} 👋</p>
        <h1 className="text-2xl font-bold text-gray-900">Mi panel</h1>
      </div>

      {/* Próxima reserva */}
      <div className="rounded-xl border border-cesped-200 bg-cesped-50 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-cesped-800"><CalendarCheck size={16} /> Tu próxima reserva</p>
        {proxima ? (
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold capitalize text-gray-900">{fechaLarga(proxima.fecha)}</p>
              <BadgeEstado estado={proxima.estado} />
            </div>
            <p className="text-gray-700">
              {hhmm(proxima.hora_inicio)} – {hhmm(proxima.hora_fin)} · {proxima.cancha?.nombre}
            </p>
            {proxima.cancha?.complejo && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-600">
                <MapPin size={14} /> {proxima.cancha.complejo.nombre} · {proxima.cancha.complejo.direccion}, {proxima.cancha.complejo.distrito}
              </p>
            )}
            <Link to="/jugador/reservas" className="mt-3 inline-block text-sm font-semibold text-cesped-700 hover:underline">Ver mis reservas →</Link>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-gray-700">No tienes partidos programados.</p>
            <Link to="/canchas" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cesped-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cesped-700">
              <Search size={16} /> Buscar canchas
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Tarjeta icono={Wallet} titulo="Total gastado" valor={soles(resumen.total_gastado)} />
        <Tarjeta icono={CalendarDays} titulo="Reservas este mes" valor={String(resumen.reservas_mes)} />
        <Tarjeta icono={CalendarCheck} titulo="Reservas en total" valor={String(resumen.reservas_total)} />
      </div>
    </>
  )
}
