import { Construction } from 'lucide-react'

/** Para rutas del panel que no existen (p. ej. /admin/algo-que-no-existe). */
export function EnConstruccion() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
      <Construction className="mx-auto mb-2" />
      Esta sección no existe o todavía no está disponible.
    </div>
  )
}
