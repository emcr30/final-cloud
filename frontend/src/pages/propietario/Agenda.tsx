import { useEffect, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, Lock, Phone, User, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { ESTADO_RESERVA, fechaCorta, fechaLarga, hhmm, hoyLima, instanteLima, soles, sumarDias, type EstadoReserva } from '../../lib/canchas'
import { DIAS_CORTOS, horaNum, horaTexto, lunesDe, type ComplejoPanel } from '../../lib/panel'
import { Alerta, Cargando, claseInput } from '../../components/ui'
import BadgeEstado from '../../components/BadgeEstado'

interface ReservaAgenda {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: EstadoReserva
  monto: number
  es_bloqueo: boolean
  jugador: { nombre: string; telefono: string | null } | null
}

/** Color de cada bloque en la grilla (los bloqueos van en gris oscuro). */
const COLOR: Record<EstadoReserva | 'bloqueo', string> = {
  pendiente_pago: 'bg-amber-200 text-amber-900 hover:bg-amber-300',
  pagada: 'bg-cesped-500 text-white hover:bg-cesped-600',
  completada: 'bg-blue-500 text-white hover:bg-blue-600',
  cancelada: 'bg-gray-100 text-gray-400',
  bloqueo: 'bg-gray-700 text-white hover:bg-gray-800',
}

/**
 * /propietario/agenda: calendario semanal por cancha.
 * - Clic en una reserva → detalle, "Marcar completada" o "Cancelar".
 * - Clic en una hora libre → "Bloquear" (reserva interna sin pago).
 * Todo directo en Supabase; RLS limita a las canchas propias.
 */
export default function Agenda() {
  const { perfil } = useAuth()
  const [complejos, setComplejos] = useState<ComplejoPanel[] | null>(null)
  const [complejoId, setComplejoId] = useState('')
  const [canchaId, setCanchaId] = useState('')
  const [lunes, setLunes] = useState(() => lunesDe(hoyLima()))
  const [reservas, setReservas] = useState<ReservaAgenda[]>([])
  const [seleccion, setSeleccion] = useState<{ reserva?: ReservaAgenda; fecha: string; hora: number } | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  // Momento de la última consulta: sirve para saber qué horas ya pasaron
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    supabase.from('complejos')
      .select('id, nombre, hora_apertura, hora_cierre, estado, canchas(id, nombre, activa, tipo)')
      .eq('propietario_id', perfil!.id).order('nombre')
      .then(({ data }) => {
        const lista = (data ?? []) as unknown as ComplejoPanel[]
        setComplejos(lista)
        if (lista[0]) {
          setComplejoId(lista[0].id)
          setCanchaId([...(lista[0].canchas ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre))[0]?.id ?? '')
        }
      })
  }, [perfil])

  const domingo = sumarDias(lunes, 6)
  useEffect(() => {
    if (!canchaId) return
    supabase.from('reservas')
      .select('id, fecha, hora_inicio, hora_fin, estado, monto, es_bloqueo, jugador:profiles(nombre, telefono)')
      .eq('cancha_id', canchaId).gte('fecha', lunes).lte('fecha', domingo)
      .then(({ data, error }) => {
        if (error) setMensaje({ tipo: 'error', texto: error.message })
        setReservas((data ?? []) as unknown as ReservaAgenda[])
        setAhora(Date.now())
      })
  }, [canchaId, lunes, domingo, recarga])
  const recargar = () => setRecarga((n) => n + 1)

  if (!complejos) return <Cargando />
  if (complejos.length === 0) return <Alerta tipo="info">Primero registra un complejo y sus canchas en "Mis complejos".</Alerta>

  const complejo = complejos.find((c) => c.id === complejoId)!
  const canchas = [...(complejo.canchas ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const horas = Array.from({ length: horaNum(complejo.hora_cierre) - horaNum(complejo.hora_apertura) }, (_, i) => horaNum(complejo.hora_apertura) + i)
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
  const hoy = hoyLima()

  /** Reserva vigente (no cancelada) que ocupa esa fecha y hora. */
  const reservaEn = (fecha: string, hora: number) =>
    reservas.find((r) => r.fecha === fecha && r.estado !== 'cancelada' && horaNum(r.hora_inicio) <= hora && hora < horaNum(r.hora_fin))

  async function cambiarEstado(r: ReservaAgenda, estado: 'completada' | 'cancelada') {
    const texto = estado === 'completada' ? '¿Marcar como completada?'
      : r.es_bloqueo ? '¿Quitar este bloqueo?'
      : '¿Cancelar esta reserva? Si el jugador ya pagó, el reembolso se gestiona aparte (modo prueba).'
    if (!confirm(texto)) return
    setOcupado(true)
    if (estado === 'cancelada') {
      // Cancelar va por el backend: expira la sesión de Stripe abierta (si la hay)
      // para que el jugador ya no pueda pagar una reserva cancelada.
      try {
        const res = await api<{ resultado: 'cancelada' | 'pagada' }>(`/reservas/${r.id}/cancelar`, { method: 'POST' })
        setMensaje(res.resultado === 'pagada'
          ? { tipo: 'exito', texto: 'No se canceló: el jugador ya había pagado y la reserva quedó confirmada.' }
          : { tipo: 'exito', texto: r.es_bloqueo ? 'Bloqueo quitado.' : 'Reserva cancelada.' })
      } catch (e) {
        setMensaje({ tipo: 'error', texto: (e as Error).message })
      }
    } else {
      const { data, error } = await supabase.from('reservas').update({ estado }).eq('id', r.id).select('id')
      setMensaje(error ? { tipo: 'error', texto: error.message }
        : !data.length ? { tipo: 'error', texto: 'No se pudo actualizar la reserva.' }
        : { tipo: 'exito', texto: 'Reserva marcada como completada.' })
    }
    setSeleccion(null)
    setOcupado(false)
    recargar()
  }

  async function bloquear(fecha: string, hora: number) {
    setOcupado(true)
    const { error } = await supabase.from('reservas').insert({
      cancha_id: canchaId, jugador_id: perfil!.id, fecha,
      hora_inicio: horaTexto(hora), hora_fin: horaTexto(hora + 1),
      estado: 'pagada', es_bloqueo: true, // la política RLS exige exactamente esto
    })
    setMensaje(error
      ? { tipo: 'error', texto: error.code === '23P01' ? 'Ese horario acaba de ser reservado.' : error.message }
      : { tipo: 'exito', texto: `Horario bloqueado: ${fechaCorta(fecha)} ${horaTexto(hora)}.` })
    setSeleccion(null)
    setOcupado(false)
    recargar()
  }

  const sel = seleccion
  const r = sel?.reserva
  const yaPaso = (fecha: string, hora: number) => instanteLima(fecha, horaTexto(hora)).getTime() < ahora

  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold text-gray-900">Agenda</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Complejo</span>
          <select className={`${claseInput} py-1.5`} value={complejoId} onChange={(e) => {
            const c = complejos.find((x) => x.id === e.target.value)!
            setComplejoId(c.id)
            setCanchaId([...(c.canchas ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre))[0]?.id ?? '')
            setSeleccion(null)
          }}>
            {complejos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Cancha</span>
          <select className={`${claseInput} py-1.5`} value={canchaId} onChange={(e) => { setCanchaId(e.target.value); setSeleccion(null) }}>
            {canchas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activa ? '' : ' (inactiva)'}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button onClick={() => setLunes(sumarDias(lunes, -7))} className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50" aria-label="Semana anterior"><ChevronLeft size={16} /></button>
          <button onClick={() => setLunes(lunesDe(hoy))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Hoy</button>
          <button onClick={() => setLunes(sumarDias(lunes, 7))} className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50" aria-label="Semana siguiente"><ChevronRight size={16} /></button>
          <span className="ml-2 text-sm font-medium text-gray-700">{fechaCorta(lunes)} – {fechaCorta(domingo)}</span>
        </div>
      </div>

      {mensaje && <div className="mb-3"><Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta></div>}

      {/* Leyenda: el color nunca va solo, siempre con su texto */}
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-600">
        {(['pagada', 'pendiente_pago', 'completada'] as const).map((e) => (
          <span key={e} className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${COLOR[e]}`} /> {ESTADO_RESERVA[e].texto}</span>
        ))}
        <span className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${COLOR.bloqueo}`} /> Bloqueo interno</span>
        <span>· Clic en una hora libre para bloquearla</span>
      </div>

      {canchas.length === 0 ? <Alerta tipo="info">Este complejo no tiene canchas.</Alerta> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-14 p-2" />
                {dias.map((d, i) => (
                  <th key={d} className={`p-2 font-semibold ${d === hoy ? 'text-cesped-700' : 'text-gray-700'}`}>
                    {DIAS_CORTOS[i]} {Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horas.map((h) => (
                <tr key={h} className="border-t border-gray-100">
                  <th className="p-1 text-right font-normal text-gray-500">{horaTexto(h)}</th>
                  {dias.map((d) => {
                    const res = reservaEn(d, h)
                    const pasado = yaPaso(d, h)
                    const elegida = sel && sel.fecha === d && sel.hora === h

                    if (res) {
                      // Una reserva de varias horas se dibuja como UN bloque: la celda de su
                      // primera hora visible ocupa todas sus filas (rowSpan) y las demás no se dibujan.
                      const desde = Math.max(horaNum(res.hora_inicio), horas[0])
                      if (h !== desde) return null
                      const filas = Math.min(horaNum(res.hora_fin), horas[horas.length - 1] + 1) - desde
                      const nombre = res.es_bloqueo ? 'Bloqueo' : res.jugador?.nombre.split(' ')[0] ?? 'Reserva'
                      const rango = `${hhmm(res.hora_inicio)}–${hhmm(res.hora_fin)}`
                      const marcada = sel?.reserva?.id === res.id
                      return (
                        <td key={d} rowSpan={filas} className="p-0.5 align-top">
                          <button onClick={() => setSeleccion({ reserva: res, fecha: d, hora: desde })}
                            title={`${res.jugador?.nombre ?? nombre} · ${rango}`}
                            // Alto = filas × (2rem del botón + 0.25rem de padding) + 1px de borde entre filas
                            style={{ height: `calc(${filas * 2.25 - 0.25}rem + ${filas - 1}px)` }}
                            className={`flex w-full flex-col justify-start overflow-hidden rounded-md px-1.5 py-1 text-left leading-tight ${COLOR[res.es_bloqueo ? 'bloqueo' : res.estado]} ${marcada ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`}>
                            {filas > 1 ? (
                              <>
                                <span className="truncate font-semibold">{nombre}</span>
                                <span className="truncate font-mono text-[0.68rem] opacity-90">{rango}</span>
                              </>
                            ) : (
                              <span className="truncate"><b className="font-semibold">{nombre}</b> <span className="font-mono text-[0.68rem] opacity-90">· {rango}</span></span>
                            )}
                          </button>
                        </td>
                      )
                    }

                    return (
                      <td key={d} className="p-0.5">
                        {/* Hora libre: clic para bloquearla */}
                        <button disabled={pasado} onClick={() => setSeleccion({ fecha: d, hora: h })}
                          className={`h-8 w-full rounded border border-dashed ${pasado ? 'cursor-default border-transparent bg-gray-50' : 'border-gray-200 hover:border-cesped-500 hover:bg-cesped-50'} ${elegida ? 'ring-2 ring-gray-900' : ''}`}
                          aria-label={`Libre ${d} ${horaTexto(h)}`} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel de la celda elegida */}
      {sel && (
        <div className="mt-4 rounded-2xl border border-gray-200 p-4">
          <p className="font-semibold capitalize text-gray-900">{fechaLarga(sel.fecha)}</p>
          {r ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-700">
                {hhmm(r.hora_inicio)} – {hhmm(r.hora_fin)} ·
                {r.es_bloqueo ? <span className="font-semibold">Bloqueo interno</span> : <BadgeEstado estado={r.estado} />}
                {!r.es_bloqueo && <b>{soles(r.monto)}</b>}
              </div>
              {!r.es_bloqueo && r.jugador && (
                <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-1"><User size={14} /> {r.jugador.nombre}</span>
                  {r.jugador.telefono && <a href={`tel:${r.jugador.telefono}`} className="flex items-center gap-1 hover:underline"><Phone size={14} /> {r.jugador.telefono}</a>}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.estado === 'pagada' && !r.es_bloqueo && (
                  <button disabled={ocupado} onClick={() => cambiarEstado(r, 'completada')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                    <CalendarCheck size={16} /> Marcar completada
                  </button>
                )}
                {(r.estado === 'pagada' || r.estado === 'pendiente_pago') && (
                  <button disabled={ocupado} onClick={() => cambiarEstado(r, 'cancelada')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                    <XCircle size={16} /> {r.es_bloqueo ? 'Quitar bloqueo' : 'Cancelar reserva'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-700">{horaTexto(sel.hora)} – {horaTexto(sel.hora + 1)} · libre</span>
              <button disabled={ocupado} onClick={() => bloquear(sel.fecha, sel.hora)} className="inline-flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60">
                <Lock size={16} /> Bloquear este horario
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
