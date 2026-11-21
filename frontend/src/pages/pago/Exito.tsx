import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Mail, MapPin, Printer } from 'lucide-react'
import { api } from '../../lib/api'
import { Alerta, Cargando } from '../../components/ui'

/** Lo que devuelve POST /pagos/verificar. */
interface Comprobante {
  reserva_id: string
  estado: string
  complejo: string
  direccion: string
  distrito: string
  lat: number | null
  lng: number | null
  cancha: string
  fecha_larga: string
  hora_inicio: string
  hora_fin: string
  monto: string
  correo?: 'enviado' | 'error' | 'omitido'
}

/**
 * /pago/exito?session_id=cs_test_...  — Stripe redirige aquí después de pagar.
 * Le pedimos al backend que verifique la sesión con Stripe (el navegador no es
 * de confiar: cualquiera podría abrir esta URL) y mostramos el comprobante.
 */
export default function PagoExito() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  const [comprobante, setComprobante] = useState<Comprobante | null>(null)
  const [error, setError] = useState(sessionId ? '' : 'Falta el identificador del pago.')

  useEffect(() => {
    if (!sessionId) return
    // El backend es idempotente: si el webhook ya confirmó, solo devuelve el comprobante
    api<Comprobante>('/pagos/verificar', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) })
      .then(setComprobante)
      .catch((e: Error) => setError(e.message))
  }, [sessionId])

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alerta>No pudimos confirmar tu pago: {error}</Alerta>
        <Link to="/jugador/reservas" className="mt-4 inline-block font-semibold text-cesped-700 hover:underline">Ir a Mis reservas</Link>
      </div>
    )
  }
  if (!comprobante) return <Cargando texto="Confirmando tu pago con Stripe…" />

  const filas: [string, string][] = [
    ['Complejo', comprobante.complejo],
    ['Cancha', comprobante.cancha],
    ['Fecha', comprobante.fecha_larga],
    ['Horario', `${comprobante.hora_inicio} – ${comprobante.hora_fin}`],
    ['Dirección', `${comprobante.direccion}, ${comprobante.distrito}`],
  ]

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
        <div className="bg-cesped-600 px-6 py-6 text-center text-white">
          <CheckCircle2 size={48} className="mx-auto" />
          <h1 className="mt-2 text-2xl font-bold">¡Reserva confirmada!</h1>
          <p className="text-cesped-100">Tu pago fue aprobado.</p>
        </div>
        <div className="p-6">
          <dl className="space-y-2 text-sm">
            {filas.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 text-base">
              <dt className="font-semibold">Total pagado</dt>
              <dd className="font-bold text-cesped-700">{comprobante.monto}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-gray-500">Código de reserva: {comprobante.reserva_id}</p>

          {comprobante.correo === 'enviado' && (
            <p className="mt-4 flex items-center gap-2 text-sm text-gray-600"><Mail size={16} /> Te enviamos la confirmación por correo.</p>
          )}
          {comprobante.correo === 'error' && (
            <div className="mt-4"><Alerta tipo="info">El pago está confirmado, pero no pudimos enviar el correo de confirmación.</Alerta></div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/jugador/reservas" className="flex-1 rounded-lg bg-cesped-600 px-4 py-2.5 text-center font-semibold text-white hover:bg-cesped-700">Mis reservas</Link>
            {comprobante.lat != null && (
              <a href={`https://www.google.com/maps?q=${comprobante.lat},${comprobante.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium hover:bg-gray-50">
                <MapPin size={16} /> Cómo llegar
              </a>
            )}
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium hover:bg-gray-50">
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
