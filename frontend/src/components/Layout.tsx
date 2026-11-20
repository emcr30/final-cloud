import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

/** Año actual (se calcula una vez, fuera del render). */
const ANIO = new Date().getFullYear()

/** Layout base: navbar arriba, contenido de la ruta al centro y pie de página. */
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-gray-200 bg-gray-900 py-6 text-center text-sm text-gray-400">
        © {ANIO} CanchaYa · Trabajo final de Cloud Computing
      </footer>
    </div>
  )
}
