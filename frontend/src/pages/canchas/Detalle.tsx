import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, Clock, CreditCard, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Alerta, Cargando, claseBoton } from '../../components/ui'
import FotoComplejo from '../../components/FotoComplejo'
import MapaComplejos from '../../components/MapaComplejos'
import {
  NOMBRE_SUPERFICIE, NOMBRE_TIPO, errorReserva, fechaCorta, fechaLarga, hhmm, hoyLima, soles, sumarDias,
  type Complejo, type Franja,
} from '../../lib/canchas'

/** Máximo de horas seguidas que se pueden reservar de una vez. */
const MAX_HORAS = 3
/** Cuántos días hacia adelante se muestran en el selector de fecha. */
const DIAS_VISIBLES = 14

/**
 * /canchas/:complejoId (pública): detalle del complejo, elección de cancha,
 * fecha y de 1 a 3 horas consecutivas. Al confirmar crea la reserva
 * (pendiente_pago) y pide al backend la URL de pago de Stripe.
 */
export default function Detalle() {
  const { complejoId } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const ubicacion = useLocation()

  const [complejo, setComplejo] = useState<Complejo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [canchaId, setCanchaId] = useState('')
  const [fecha, setFecha] = useState(hoyLima())
  const [franjas, setFranjas] = useState<Franja[]>([])

  // Selección: índice de la primera hora y cuántas horas seguidas
  const [inicio, setInicio] = useState<number | null>(null)
  const [horas, setHoras] = useState(0)

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // 1) Complejo y sus canchas activas
  useEffect(() => {
    supabase
      .from('complejos')
      .select('id, nombre, descripcion, direccion, distrito, lat, lng, foto_url, hora_apertura, hora_cierre, canchas(id, complejo_id, nombre, tipo, superficie, precio_hora, activa)')
      .eq('id', complejoId!)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const c = data as Complejo
          c.canchas = c.canchas.filter((k) => k.activa).sort((a, b) => a.nombre.localeCompare(b.nombre))
          setComplejo(c)
          setCanchaId(c.canchas[0]?.id ?? '')
        }
        setCargando(false)
      })
  }, [complejoId])

  // 2) Horas libres de la cancha en la fecha elegida (RPC en Postgres).
  //    `recarga` se incrementa para volver a consultar sin cambiar cancha/fecha.
  const [recarga, setRecarga] = useState(0)
  const [consultaLista, setConsultaLista] = useState('') // qué consulta ya llegó
  const consulta = `${canchaId}|${fecha}|${recarga}`
  const cargandoFranjas = canchaId !== '' && consultaLista !== consulta

  useEffect(() => {
    if (!canchaId) return
    supabase.rpc('disponibilidad', { p_cancha_id: canchaId, p_fecha: fecha }).then(({ data, error }) => {
      if (error) setError('No se pudo consultar la disponibilidad: ' + error.message)
      setFranjas((data ?? []) as Franja[])
      setInicio(null) // la grilla cambió: se limpia la selección
      setHoras(0)
      setConsultaLista(`${canchaId}|${fecha}|${recarga}`)
    })
  }, [canchaId, fecha, recarga])
  const cargarFranjas = () => setRecarga((n) => n + 1)

  /**
   * Clic en una hora:
   *  - si es la siguiente a la selección actual (y no pasa de 3 horas), la extiende;
   *  - si es la última hora seleccionada, la quita;
   *  - en otro caso, empieza una selección nueva desde ahí.
   */
  function elegirHora(i: number) {
    setError('')
    setAviso('')
    if (inicio !== null && i === inicio + horas && horas < MAX_HORAS) {
      setHoras(horas + 1)
    } else if (inicio !== null && horas > 1 && i === inicio + horas - 1) {
      setHoras(horas - 1)
    } else if (inicio === i && horas === 1) {
      setInicio(null)
      setHoras(0)
    } else {
      setInicio(i)
      setHoras(1)
    }
  }

  const cancha = complejo?.canchas.find((k) => k.id === canchaId)
  const total = cancha ? cancha.precio_hora * horas : 0
  const seleccion = inicio !== null ? { desde: franjas[inicio].hora_inicio, hasta: franjas[inicio + horas - 1].hora_fin } : null

  async function confirmar() {
    if (!seleccion || !cancha) return
    // Sin sesión: primero iniciar sesión y volver a esta misma página
    if (!session) {
      navigate('/login', { state: { desde: ubicacion.pathname } })
      return
    }
    setEnviando(true)
    setError('')
    setAviso('')

    // La reserva nace "pendiente_pago". El monto lo calcula un trigger en la base
    // (el navegador no puede inventar el precio) y la restricción EXCLUDE impide
    // que dos personas reserven la misma hora.
    const { data: reserva, error: errInsert } = await supabase
      .from('reservas')
      .insert({
        cancha_id: cancha.id,
        jugador_id: session.user.id,
        fecha,
        hora_inicio: seleccion.desde,
        hora_fin: seleccion.hasta,
        estado: 'pendiente_pago',
      })
      .select('id, monto')
      .single()

    if (errInsert || !reserva) {
      setError(errorReserva(errInsert ?? { message: 'No se pudo crear la reserva.' }))
      setEnviando(false)
      cargarFranjas() // refrescar la grilla: otra persona pudo tomar la hora
      return
    }

    // Pago con Stripe Checkout (backend, Parte 5): devuelve la URL de pago
    try {
      const { url } = await api<{ url: string }>('/pagos/checkout', {
        method: 'POST',
        body: JSON.stringify({ reserva_id: reserva.id }),
      })
      window.location.assign(url)
    } catch {
      setAviso(
        `Tu reserva por ${soles(reserva.monto)} quedó registrada como "pendiente de pago", pero el pago en línea no está disponible en este momento. ` +
        'Puedes pagarla desde "Mis reservas" en los próximos 15 minutos; si no, se libera el horario.',
      )
      setEnviando(false)
      cargarFranjas()
    }
  }

  if (cargando) return <Cargando />
  if (!complejo) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-gray-600">Este complejo no existe o no está disponible.</p>
        <Link to="/canchas" className="mt-4 inline-block font-semibold text-cesped-700 hover:underline">Volver a la búsqueda</Link>
      </div>
    )
  }

  const dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(hoyLima(), i))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/canchas" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={16} /> Volver a la búsqueda
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* Columna principal */}
        <div className="min-w-0">
          <FotoComplejo url={complejo.foto_url} nombre={complejo.nombre} className="h-48 rounded-xl sm:h-64" />
          <h1 className="mt-5 text-3xl font-bold text-gray-900">{complejo.nombre}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1"><MapPin size={15} /> {complejo.direccion}, {complejo.distrito}</span>
            <span className="inline-flex items-center gap-1"><Clock size={15} /> {hhmm(complejo.hora_apertura)} – {hhmm(complejo.hora_cierre)}</span>
          </p>
          {complejo.descripcion && <p className="mt-3 text-gray-700">{complejo.descripcion}</p>}

          {/* 1. Cancha */}
          <h2 className="mt-8 font-semibold text-gray-900">1. Elige la cancha</h2>
          {complejo.canchas.length === 0 && <p className="mt-2 text-sm text-gray-500">Este complejo no tiene canchas disponibles.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {complejo.canchas.map((k) => (
              <button
                key={k.id}
                onClick={() => setCanchaId(k.id)}
                className={`rounded-xl border p-4 text-left transition ${k.id === canchaId ? 'border-cesped-600 bg-cesped-50 ring-2 ring-cesped-200' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="font-semibold text-gray-900">{k.nombre}</p>
                <p className="text-sm text-gray-600">{NOMBRE_TIPO[k.tipo]} · {NOMBRE_SUPERFICIE[k.superficie]}</p>
                <p className="mt-1 font-bold text-cesped-700">{soles(k.precio_hora)} / hora</p>
              </button>
            ))}
          </div>

          {/* 2. Fecha */}
          <h2 className="mt-8 font-semibold text-gray-900">2. Elige la fecha</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {dias.map((d) => (
              <button
                key={d}
                onClick={() => setFecha(d)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm capitalize ${d === fecha ? 'border-cesped-600 bg-cesped-600 font-semibold text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
              >
                {d === hoyLima() ? 'Hoy' : fechaCorta(d)}
              </button>
            ))}
          </div>

          {/* 3. Horario */}
          <h2 className="mt-8 font-semibold text-gray-900">3. Elige el horario <span className="font-normal text-gray-500">(1 a {MAX_HORAS} horas seguidas)</span></h2>
          {cargandoFranjas ? (
            <Cargando texto="Consultando horarios…" />
          ) : franjas.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No hay horarios para esta fecha.</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {franjas.map((f, i) => {
                  const elegida = inicio !== null && i >= inicio && i < inicio + horas
                  return (
                    <button
                      key={f.hora_inicio}
                      disabled={!f.disponible}
                      onClick={() => elegirHora(i)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        elegida
                          ? 'border-cesped-600 bg-cesped-600 text-white'
                          : f.disponible
                            ? 'border-gray-200 text-gray-800 hover:border-cesped-500 hover:bg-cesped-50'
                            : 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-400 line-through'
                      }`}
                    >
                      {hhmm(f.hora_inicio)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">Las horas tachadas ya están reservadas o ya pasaron. Para sumar horas, toca la hora siguiente.</p>
            </>
          )}
        </div>

        {/* Resumen (columna derecha) */}
        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <div className="rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900"><CalendarCheck size={18} /> Tu reserva</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Cancha</dt><dd className="text-right font-medium">{cancha?.nombre ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Fecha</dt><dd className="text-right font-medium capitalize">{fechaLarga(fecha)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Horario</dt><dd className="font-medium">{seleccion ? `${hhmm(seleccion.desde)} – ${hhmm(seleccion.hasta)}` : '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Duración</dt><dd className="font-medium">{horas ? `${horas} hora${horas > 1 ? 's' : ''}` : '—'}</dd></div>
              <div className="flex justify-between gap-2 border-t border-gray-200 pt-3 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold text-cesped-700">{soles(total)}</dd></div>
            </dl>
            {error && <div className="mt-4"><Alerta>{error}</Alerta></div>}
            {aviso && (
              <div className="mt-4 space-y-2">
                <Alerta tipo="info">{aviso}</Alerta>
                <Link to="/jugador/reservas" className="block text-center text-sm font-semibold text-cesped-700 hover:underline">Ir a Mis reservas</Link>
              </div>
            )}
            <button onClick={confirmar} disabled={!seleccion || enviando} className={`${claseBoton} mt-4`}>
              <CreditCard size={18} />
              {enviando ? 'Procesando…' : session ? 'Reservar y pagar' : 'Inicia sesión para reservar'}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">Pago seguro con Stripe (modo prueba).</p>
          </div>
          {complejo.lat != null && (
            <MapaComplejos complejos={[complejo]} centro={[complejo.lat, complejo.lng!]} zoom={15} alto="h-56" conEnlace={false} />
          )}
        </aside>
      </div>
    </div>
  )
}
