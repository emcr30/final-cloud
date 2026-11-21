import { Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'

/**
 * /pago/cancelado — Stripe redirige aquí si el jugador cierra el pago.
 * La reserva sigue "pendiente de pago" unos minutos; si no se paga,
 * la tarea /tareas/limpiar-pendientes la cancela y libera el horario.
 */
export default function PagoCancelado() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <XCircle size={56} className="mx-auto text-amber-500" />
      <h1 className="mt-3 text-2xl font-bold text-gray-900">Pago no completado</h1>
      <p className="mt-2 text-gray-600">
        No se realizó ningún cobro. Tu reserva quedó <b>pendiente de pago</b>: puedes pagarla desde
        "Mis reservas" en los próximos 15 minutos. Si no, el horario se libera automáticamente.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/jugador/reservas" className="rounded-lg bg-cesped-600 px-5 py-2.5 font-semibold text-white hover:bg-cesped-700">Ir a Mis reservas</Link>
        <Link to="/canchas" className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-50">Buscar otra cancha</Link>
      </div>
    </div>
  )
}
