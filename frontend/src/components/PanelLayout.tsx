import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3, Building2, CalendarDays, CalendarCheck, LayoutDashboard, LogOut,
  Map, ScrollText, Settings, User, Users, type LucideIcon,
} from 'lucide-react'
import { useAuth, type Rol } from '../context/AuthContext'
import { Cargando } from './ui'

interface Opcion { to: string; label: string; icono: LucideIcon; end?: boolean }

/** Menú lateral de cada rol: cada uno ve SOLO sus opciones. */
const MENU: Record<Rol, Opcion[]> = {
  jugador: [
    { to: '/jugador', label: 'Inicio', icono: LayoutDashboard, end: true },
    { to: '/canchas', label: 'Buscar canchas', icono: Map },
    { to: '/jugador/reservas', label: 'Mis reservas', icono: CalendarCheck },
    { to: '/jugador/solicitar-complejo', label: 'Registrar mi complejo', icono: Building2 },
  ],
  propietario: [
    { to: '/propietario', label: 'Dashboard', icono: BarChart3, end: true },
    { to: '/propietario/complejos', label: 'Mis complejos', icono: Building2 },
    { to: '/propietario/agenda', label: 'Agenda', icono: CalendarDays },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icono: BarChart3, end: true },
    { to: '/admin/usuarios', label: 'Usuarios', icono: Users },
    { to: '/admin/complejos', label: 'Complejos', icono: Building2 },
    { to: '/admin/actividad', label: 'Actividad', icono: ScrollText },
    { to: '/admin/configuracion', label: 'Configuración', icono: Settings },
  ],
}

const NOMBRE_ROL: Record<Rol, string> = { admin: 'Administrador', propietario: 'Propietario', jugador: 'Jugador' }

/** Layout de los paneles privados: sidebar (arriba en móvil) + contenido. */
export default function PanelLayout() {
  const { perfil, session, cerrarSesion } = useAuth()
  if (!perfil) return null

  const clase = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium md:rounded-xl ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-10 md:py-10">
      <aside className="md:sticky md:top-24 md:h-fit md:w-60 md:shrink-0">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cesped-200 font-semibold text-gray-900">
            {(perfil.nombre || session?.user.email || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{perfil.nombre || session?.user.email}</p>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-gray-500">{NOMBRE_ROL[perfil.rol]}</p>
          </div>
        </div>
        {/* En móvil el menú es una fila con scroll horizontal */}
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
          {MENU[perfil.rol].map(({ to, label, icono: Icono, end }) => (
            <NavLink key={to} to={to} end={end} className={clase}>
              <Icono size={18} /> {label}
            </NavLink>
          ))}
          <div className="my-2 hidden h-px bg-gray-200 md:block" />
          <NavLink to="/perfil" className={clase}>
            <User size={18} /> Mi perfil
          </NavLink>
          <button onClick={cerrarSesion} className={clase({ isActive: false })}>
            <LogOut size={18} /> Cerrar sesión
          </button>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        {/* Suspense aquí: al cambiar de sección, el menú lateral se queda y solo carga el contenido */}
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </section>
    </div>
  )
}
