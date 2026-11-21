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
      <footer className="border-t border-gray-200 bg-gray-900 py-6 text-center text-sm text-gray-400">
        © {ANIO} CanchaYa · Trabajo final de Cloud Computing ·{' '}
        <Link to="/estado" className="hover:text-white hover:underline">Estado del servicio</Link>
      </footer>
    </div>
  )
}
