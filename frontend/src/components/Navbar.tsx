import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from './Logo'

/** Enlaces del menú principal (se completan en partes posteriores). */
const enlaces = [
  { to: '/', label: 'Inicio' },
  { to: '/canchas', label: 'Buscar canchas' },
]

/** Barra de navegación responsive: menú horizontal en escritorio y desplegable en móvil. */
export default function Navbar() {
  const [abierto, setAbierto] = useState(false)

  const claseEnlace = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-cesped-50 text-cesped-700' : 'text-gray-600 hover:text-gray-900'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />

        {/* Escritorio */}
        <div className="hidden items-center gap-1 md:flex">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace}>
              {e.label}
            </NavLink>
          ))}
          <NavLink
            to="/login"
            className="ml-2 rounded-md bg-cesped-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cesped-700"
          >
            Ingresar
          </NavLink>
        </div>

        {/* Botón del menú móvil */}
        <button
          className="rounded-md p-2 text-gray-700 md:hidden"
          onClick={() => setAbierto(!abierto)}
          aria-label="Abrir menú"
        >
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Menú móvil */}
      {abierto && (
        <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-3 md:hidden">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace} onClick={() => setAbierto(false)}>
              {e.label}
            </NavLink>
          ))}
          <NavLink
            to="/login"
            className="rounded-md bg-cesped-600 px-3 py-2 text-center text-sm font-semibold text-white"
            onClick={() => setAbierto(false)}
          >
            Ingresar
          </NavLink>
        </div>
      )}
    </header>
  )
}
