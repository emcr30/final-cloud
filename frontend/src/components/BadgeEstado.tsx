import { ESTADO_RESERVA, type EstadoReserva } from '../lib/canchas'

/** Badge de color según el estado de la reserva. */
export default function BadgeEstado({ estado }: { estado: EstadoReserva }) {
  const { texto, clase } = ESTADO_RESERVA[estado]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${clase}`}>{texto}</span>
}
