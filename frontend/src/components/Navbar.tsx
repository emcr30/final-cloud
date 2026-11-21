import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import Logo from './Logo'
import { rutaPanel, useAuth } from '../context/AuthContext'

/** Enlaces públicos del menú principal. */
const enlaces = [
  { to: '/', label: 'Inicio' },
  { to: '/canchas', label: 'Buscar canchas' },
]

/**
 * Barra de navegación responsive. Sin sesión muestra "Ingresar" y "Crear cuenta";
 * con sesión muestra "Mi panel" (según el rol) y "Salir".
 */
export default function Navbar() {
  const [abierto, setAbierto] = useState(false)
  const { session, perfil, cerrarSesion } = useAuth()
  const cerrar = () => setAbierto(false)

  const claseEnlace = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-cesped-50 text-cesped-700' : 'text-gray-600 hover:text-gray-900'
    }`
  const botonPrimario = 'rounded-md bg-cesped-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-cesped-700'
  const botonSecundario = 'rounded-md px-3 py-2 text-center text-sm font-medium text-gray-600 hover:text-gray-900'

  // Botones de la derecha (los mismos en escritorio y móvil)
  const acciones =
    session && perfil ? (
      <>
        <Link to={rutaPanel(perfil.rol)} className={`${botonPrimario} inline-flex items-center justify-center gap-1.5`} onClick={cerrar}>
          <LayoutDashboard size={16} /> Mi panel
        </Link>
        <button
          onClick={() => { cerrar(); cerrarSesion() }}
          className={`${botonSecundario} inline-flex items-center justify-center gap-1.5`}
        >
          <LogOut size={16} /> Salir
        </button>
      </>
    ) : (
      <>
        <Link to="/login" className={botonSecundario} onClick={cerrar}>Ingresar</Link>
        <Link to="/registro" className={botonPrimario} onClick={cerrar}>Crear cuenta</Link>
      </>
    )

  return (
    <header className="sticky top-0 z-[1100] border-b border-gray-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />

        {/* Escritorio */}
        <div className="hidden items-center gap-1 md:flex">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace}>
              {e.label}
            </NavLink>
          ))}
          <div className="ml-2 flex items-center gap-1">{acciones}</div>
        </div>

        {/* Botón del menú móvil */}
        <button className="rounded-md p-2 text-gray-700 md:hidden" onClick={() => setAbierto(!abierto)} aria-label="Abrir menú">
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Menú móvil */}
      {abierto && (
        <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-3 md:hidden">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace} onClick={cerrar}>
              {e.label}
            </NavLink>
          ))}
          {acciones}
        </div>
      )}
    </header>
  )
}
