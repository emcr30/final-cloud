import { Link } from 'react-router-dom'

/**
 * Logo de CanchaYa: marca (una cancha vista desde arriba) + nombre.
 * `claro` se usa cuando va sobre una foto oscura (portada).
 */
export default function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 text-[1.15rem] font-semibold tracking-tight ${claro ? 'text-white' : 'text-gray-900'}`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span>
        Cancha<span className={claro ? 'text-cesped-200' : 'text-cesped-600'}>Ya</span>
      </span>
    </Link>
  )
}
