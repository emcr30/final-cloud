import { useEffect, useState } from 'react'
import { BellRing, CreditCard, Mail, Play } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { fechaCorta, hhmm, soles } from '../../lib/canchas'
import { Alerta, Cargando } from '../../components/ui'

interface Notificacion {
  id: string; tipo: string; destinatario: string; estado: string; detalle: string | null; created_at: string
}
interface Pago {
  id: string; monto: number; moneda: string; estado: string; stripe_session_id: string | null; created_at: string
  reserva: { fecha: string; hora_inicio: string; cancha: { nombre: string; complejo: { nombre: string } | null } | null } | null
}
/** Respuesta de la Edge Function send-reminders. */
interface ResultadoRecordatorios {
  dry_run: boolean; fecha: string; encontradas: number; enviados: number; errores: number
  detalle: { reserva_id: string; destinatario: string; complejo: string; hora: string; estado: string }[]
}

const LIMITE = 30
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

const COLOR_ESTADO: Record<string, string> = {
  enviado: 'bg-cesped-100 text-cesped-800', pagado: 'bg-cesped-100 text-cesped-800',
  error: 'bg-red-100 text-red-700', fallido: 'bg-red-100 text-red-700',
  omitido: 'bg-gray-200 text-gray-600', dry_run: 'bg-blue-100 text-blue-800', reembolsado: 'bg-amber-100 text-amber-800',
}
function Estado({ valor }: { valor: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[valor] ?? 'bg-gray-100 text-gray-700'}`}>{valor}</span>
}

/**
 * /admin/actividad: últimas notificaciones y pagos (lectura directa con RLS:
 * solo el admin con MFA puede leer notificaciones_log y todos los pagos),
 * y el botón para ejecutar ahora la Edge Function de recordatorios.
 */
export default function AdminActividad() {
  const [notis, setNotis] = useState<Notificacion[] | null>(null)
  const [pagos, setPagos] = useState<Pago[] | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [ejecutando, setEjecutando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoRecordatorios | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('notificaciones_log').select('id, tipo, destinatario, estado, detalle, created_at')
      .order('created_at', { ascending: false }).limit(LIMITE)
      .then(({ data }) => setNotis((data ?? []) as Notificacion[]))
    supabase.from('pagos')
      .select('id, monto, moneda, estado, stripe_session_id, created_at, reserva:reservas(fecha, hora_inicio, cancha:canchas(nombre, complejo:complejos(nombre)))')
      .order('created_at', { ascending: false }).limit(LIMITE)
      .then(({ data }) => setPagos((data ?? []) as unknown as Pago[]))
  }, [recarga])

  async function recordatorios(dryRun: boolean) {
    if (!dryRun && !confirm('¿Enviar AHORA los recordatorios de las reservas de mañana? Se mandarán correos reales.')) return
    setEjecutando(true)
    setError('')
    try {
      setResultado(await api<ResultadoRecordatorios>(`/admin/recordatorios?dry_run=${dryRun}`, { method: 'POST' }))
      setRecarga((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEjecutando(false)
    }
  }

  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold text-gray-900">Actividad</h1>

      {/* Recordatorios (Parte 8): Edge Function send-reminders */}
      <section className="mb-6 rounded-2xl border border-gray-200 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900"><BellRing size={18} /> Recordatorios de mañana</h2>
        <p className="mt-1 text-sm text-gray-600">
          Todos los días a las 18:00 (hora de Lima) pg_cron ejecuta la Edge Function <code>send-reminders</code>.
          Aquí puedes simularla (sin enviar) o ejecutarla ahora.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => recordatorios(true)} disabled={ejecutando} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
            <Play size={16} /> Simular (dry run)
          </button>
          <button onClick={() => recordatorios(false)} disabled={ejecutando} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-cesped-600 disabled:opacity-60">
            <Mail size={16} /> Ejecutar recordatorios ahora
          </button>
        </div>
        {ejecutando && <p className="mt-2 text-sm text-gray-500">Ejecutando…</p>}
        {error && <div className="mt-3"><Alerta>{error}</Alerta></div>}
        {resultado && (
          <div className="mt-3">
            <Alerta tipo={resultado.errores ? 'error' : 'exito'}>
              {resultado.dry_run ? 'Simulación' : 'Ejecución'} para el {resultado.fecha}: {resultado.encontradas} reservas encontradas,
              {' '}{resultado.dry_run ? 'no se envió nada' : `${resultado.enviados} enviados, ${resultado.errores} errores`}.
            </Alerta>
            {resultado.detalle.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-gray-600">
                {resultado.detalle.map((d) => (
                  <li key={d.reserva_id}>{d.hora} · {d.complejo} → {d.destinatario} <Estado valor={d.estado} /></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-gray-900"><Mail size={18} /> Últimas notificaciones</h2>
          {!notis ? <Cargando /> : notis.length === 0 ? <p className="text-sm text-gray-500">Aún no se enviaron correos.</p> : (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {notis.map((n) => (
                <li key={n.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium capitalize text-gray-900">{n.tipo}</span>
                    <Estado valor={n.estado} />
                  </div>
                  <p className="text-gray-600">{n.destinatario} · {fechaHora(n.created_at)}</p>
                  {n.detalle && <p className="truncate text-xs text-gray-400" title={n.detalle}>{n.detalle}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-gray-900"><CreditCard size={18} /> Últimos pagos</h2>
          {!pagos ? <Cargando /> : pagos.length === 0 ? <p className="text-sm text-gray-500">Aún no hay pagos.</p> : (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {pagos.map((p) => (
                <li key={p.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{soles(p.monto)} <span className="text-xs uppercase text-gray-500">{p.moneda}</span></span>
                    <Estado valor={p.estado} />
                  </div>
                  {p.reserva && (
                    <p className="text-gray-600">
                      {p.reserva.cancha?.complejo?.nombre} · {p.reserva.cancha?.nombre} · {fechaCorta(p.reserva.fecha)} {hhmm(p.reserva.hora_inicio)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {fechaHora(p.created_at)} · {p.stripe_session_id?.startsWith('cs_test_seed_') ? 'dato demo' : p.stripe_session_id?.slice(0, 24) + '…'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
