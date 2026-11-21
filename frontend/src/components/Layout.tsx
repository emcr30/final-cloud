import { Suspense, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import { Cargando } from './ui'

/** Año actual (se calcula una vez, fuera del render). */
const ANIO = new Date().getFullYear()

/** Título de la pestaña según la ruta (el primero que coincide). */
const TITULOS: [RegExp, string][] = [
  [/^\/$/, 'Reserva tu cancha'],
  [/^\/canchas\/.+/, 'Detalle del complejo'],
  [/^\/canchas/, 'Buscar canchas'],
  [/^\/login/, 'Ingresar'],
  [/^\/registro/, 'Crear cuenta'],
  [/^\/(recuperar|nueva-password)/, 'Recuperar contraseña'],
  [/^\/mfa/, 'Verificación en dos pasos'],
  [/^\/pago/, 'Pago'],
  [/^\/estado/, 'Estado del servicio'],
  [/^\/perfil/, 'Mi perfil'],
  [/^\/jugador\/reservas/, 'Mis reservas'],
  [/^\/jugador\/solicitar/, 'Registrar mi complejo'],
  [/^\/jugador/, 'Mi panel'],
  [/^\/propietario\/complejos/, 'Mis complejos'],
  [/^\/propietario\/agenda/, 'Agenda'],
  [/^\/propietario/, 'Dashboard del complejo'],
  [/^\/admin\/usuarios/, 'Usuarios'],
  [/^\/admin\/complejos/, 'Complejos'],
  [/^\/admin\/actividad/, 'Actividad'],
  [/^\/admin\/configuracion/, 'Configuración'],
  [/^\/admin/, 'Administración'],
  [/^\/403/, 'Acceso denegado'],
]

function TituloPagina() {
  const { pathname } = useLocation()
  useEffect(() => {
    const titulo = TITULOS.find(([re]) => re.test(pathname))?.[1] ?? 'Página no encontrada'
    document.title = `${titulo} · CanchaYa`
  }, [pathname])
  return null
}

/** Layout base: navbar arriba, contenido de la ruta al centro y pie de página. */
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <TituloPagina />
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="bg-gray-950 text-gray-400">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-lg font-semibold text-white">Cancha<span className="text-cesped-200">Ya</span></p>
            <p className="mt-2 max-w-xs text-sm">Canchas de fútbol 5, 7 y 11 en Arequipa, con horarios en tiempo real y pago en línea.</p>
          </div>
          <nav aria-label="Jugadores" className="flex flex-col gap-1 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-gray-400">Jugadores</p>
            <Link to="/canchas" className="py-1.5 hover:text-white focus-visible:outline-cesped-200">Buscar canchas</Link>
            <Link to="/registro" className="py-1.5 hover:text-white focus-visible:outline-cesped-200">Crear cuenta</Link>
            <Link to="/login" className="py-1.5 hover:text-white focus-visible:outline-cesped-200">Ingresar</Link>
          </nav>
          <nav aria-label="Complejos" className="flex flex-col gap-1 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-gray-400">Complejos</p>
            <Link to="/registro?complejo=1" className="py-1.5 hover:text-white focus-visible:outline-cesped-200">Registrar mi complejo</Link>
            <Link to="/estado" className="py-1.5 hover:text-white focus-visible:outline-cesped-200">Estado del servicio</Link>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-gray-400 sm:px-6">
            © {ANIO} CanchaYa · Trabajo final de Cloud Computing
          </p>
        </div>
      </footer>
    </div>
  )
}
