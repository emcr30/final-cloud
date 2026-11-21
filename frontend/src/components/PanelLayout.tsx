import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3, Building2, CalendarDays, CalendarCheck, LayoutDashboard, LogOut,
  Map, ScrollText, Settings, User, Users, type LucideIcon,
} from 'lucide-react'
import { useAuth, type Rol } from '../context/AuthContext'

interface Opcion { to: string; label: string; icono: LucideIcon; end?: boolean }

/** Menú lateral de cada rol: cada uno ve SOLO sus opciones. */
const MENU: Record<Rol, Opcion[]> = {
  jugador: [
    { to: '/jugador', label: 'Inicio', icono: LayoutDashboard, end: true },
    { to: '/canchas', label: 'Buscar canchas', icono: Map },
    { to: '/jugador/reservas', label: 'Mis reservas', icono: CalendarCheck },
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
    `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-cesped-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-56 md:shrink-0">
        <div className="mb-3 rounded-xl border border-gray-200 p-3">
          <p className="truncate font-semibold text-gray-900">{perfil.nombre || session?.user.email}</p>
          <span className="mt-1 inline-block rounded-full bg-cesped-100 px-2 py-0.5 text-xs font-semibold text-cesped-800">
            {NOMBRE_ROL[perfil.rol]}
          </span>
        </div>
        {/* En móvil el menú es una fila con scroll horizontal */}
        <nav className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
          {MENU[perfil.rol].map(({ to, label, icono: Icono, end }) => (
            <NavLink key={to} to={to} end={end} className={clase}>
              <Icono size={18} /> {label}
            </NavLink>
          ))}
          <NavLink to="/perfil" className={clase}>
            <User size={18} /> Mi perfil
          </NavLink>
          <button onClick={cerrarSesion} className={clase({ isActive: false })}>
            <LogOut size={18} /> Cerrar sesión
          </button>
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        <Outlet />
      </section>
    </div>
  )
}
