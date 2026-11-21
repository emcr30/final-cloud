import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX, CreditCard, MapPin, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Alerta, Cargando } from '../../components/ui'
import BadgeEstado from '../../components/BadgeEstado'
import {
  NOMBRE_TIPO, SELECT_RESERVA, fechaLarga, hhmm, hoyLima, instanteLima, puedeCancelar, soles,
  type ReservaDetalle,
} from '../../lib/canchas'

/** Cuántas reservas pasadas se muestran en el historial. */
const LIMITE_HISTORIAL = 50

/**
 * /jugador/reservas: próximas e historial. RLS garantiza que el jugador
 * solo recibe SUS reservas; igual filtramos por jugador_id porque un admin
 * (que ve todo) también podría abrir esta página.
 */
export default function MisReservas() {
  const { session } = useAuth()
  const [reservas, setReservas] = useState<ReservaDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [pestana, setPestana] = useState<'proximas' | 'historial'>('proximas')
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null) // id de la reserva en proceso

  // Se incrementa para volver a consultar (p. ej. después de cancelar)
  const [recarga, setRecarga] = useState(0)
  // Momento de la última consulta: sirve para separar próximas e historial
  const [ahora, setAhora] = useState(() => Date.now())

  // Dos consultas: próximas (desde hoy, todas) e historial (las últimas 50).
  // Así no chocamos con el límite de 1000 filas de la API.
  useEffect(() => {
    const hoy = hoyLima()
    const base = () => supabase.from('reservas').select(SELECT_RESERVA).eq('jugador_id', session!.user.id)
    Promise.all([
      base().gte('fecha', hoy).order('fecha').order('hora_inicio'),
      base().lt('fecha', hoy).order('fecha', { ascending: false }).order('hora_inicio', { ascending: false }).limit(LIMITE_HISTORIAL),
    ]).then(([desdeHoy, pasadas]) => {
      const error = desdeHoy.error ?? pasadas.error
      if (error) setMensaje({ tipo: 'error', texto: 'No se pudieron cargar tus reservas: ' + error.message })
      setReservas([...(desdeHoy.data ?? []), ...(pasadas.data ?? [])] as unknown as ReservaDetalle[])
      setAhora(Date.now())
      setCargando(false)
    })
  }, [session, recarga])
  const cargar = () => setRecarga((n) => n + 1)

  async function cancelar(r: ReservaDetalle) {
    if (!confirm(`¿Cancelar tu reserva del ${fechaLarga(r.fecha)} a las ${hhmm(r.hora_inicio)}?`)) return
    setOcupada(r.id)
    setMensaje(null)
    // RLS solo deja pasar el UPDATE si faltan más de 2 horas; si no, afecta 0 filas
    const { data, error } = await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', r.id).select('id')
    if (error) setMensaje({ tipo: 'error', texto: error.message })
    else if (!data.length) setMensaje({ tipo: 'error', texto: 'Ya no se puede cancelar: faltan menos de 2 horas para el partido.' })
    else setMensaje({ tipo: 'exito', texto: 'Reserva cancelada. El horario quedó libre para otros jugadores.' })
    setOcupada(null)
    cargar()
  }

  async function pagar(r: ReservaDetalle) {
    setOcupada(r.id)
    setMensaje(null)
    try {
      const { url } = await api<{ url: string }>('/pagos/checkout', { method: 'POST', body: JSON.stringify({ reserva_id: r.id }) })
      window.location.assign(url)
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `No se pudo iniciar el pago: ${(e as Error).message}` })
      setOcupada(null)
    }
  }

  if (cargando) return <Cargando />

  // Próximas = vigentes (pendiente o pagada) que aún no terminan
  const esProxima = (r: ReservaDetalle) =>
    (r.estado === 'pendiente_pago' || r.estado === 'pagada') && instanteLima(r.fecha, r.hora_fin).getTime() > ahora
  const proximas = reservas.filter(esProxima) // ya vienen de la más cercana a la más lejana
  const historial = reservas
    .filter((r) => !esProxima(r))
    .sort((a, b) => instanteLima(b.fecha, b.hora_inicio).getTime() - instanteLima(a.fecha, a.hora_inicio).getTime())
  const lista = pestana === 'proximas' ? proximas : historial

  const clasePestana = (activa: boolean) =>
    `min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${activa ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-gray-900">Mis reservas</h1>
        <Link to="/canchas" className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-cesped-600">Nueva reserva</Link>
      </div>

      <div className="mb-4 flex gap-2">
        <button className={clasePestana(pestana === 'proximas')} onClick={() => setPestana('proximas')}>Próximas ({proximas.length})</button>
        <button className={clasePestana(pestana === 'historial')} onClick={() => setPestana('historial')}>Historial</button>
      </div>

      {mensaje && <div className="mb-4"><Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta></div>}

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <CalendarX className="mx-auto mb-2" />
          {pestana === 'proximas' ? 'No tienes reservas próximas.' : 'Aún no tienes reservas pasadas.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold capitalize text-gray-900">{fechaLarga(r.fecha)}</p>
                  <BadgeEstado estado={r.estado} />
                </div>
                <p className="text-sm text-gray-700">
                  {hhmm(r.hora_inicio)} – {hhmm(r.hora_fin)} · {r.cancha?.nombre ?? 'Cancha'}
                  {r.cancha && ` (${NOMBRE_TIPO[r.cancha.tipo]})`} · <b>{soles(r.monto)}</b>
                </p>
                {r.cancha?.complejo && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                    <MapPin size={14} />
                    <Link to={`/canchas/${r.cancha.complejo.id}`} className="hover:underline">{r.cancha.complejo.nombre}</Link>
                    · {r.cancha.complejo.distrito}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {r.estado === 'pendiente_pago' && esProxima(r) && (
                  <button onClick={() => pagar(r)} disabled={ocupada === r.id} className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-cesped-600 disabled:opacity-60">
                    <CreditCard size={16} /> Pagar
                  </button>
                )}
                {puedeCancelar(r) && (
                  <button onClick={() => cancelar(r)} disabled={ocupada === r.id} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                    <XCircle size={16} /> Cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Puedes cancelar hasta 2 horas antes del inicio.{pestana === 'historial' && ` El historial muestra tus últimas ${LIMITE_HISTORIAL} reservas.`}
      </p>
    </>
  )
}
