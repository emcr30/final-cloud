import { Link } from 'react-router-dom'

/** Logo de CanchaYa: ícono de cancha + nombre. */
export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold text-lg text-gray-900">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span>
        Cancha<span className="text-cesped-600">Ya</span>
      </span>
    </Link>
  )
}
