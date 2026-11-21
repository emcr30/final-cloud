import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
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
 * En la portada empieza transparente sobre la foto y se vuelve blanca al bajar.
 */
export default function Navbar() {
  const [abierto, setAbierto] = useState(false)
  const [bajo, setBajo] = useState(false)
  const { session, perfil, cerrarSesion } = useAuth()
  const { pathname } = useLocation()
  const cerrar = () => setAbierto(false)

  // ¿Ya se bajó un poco? (solo importa en la portada)
  useEffect(() => {
    const revisar = () => setBajo(window.scrollY > 40)
    revisar()
    window.addEventListener('scroll', revisar, { passive: true })
    return () => window.removeEventListener('scroll', revisar)
  }, [])

  // Transparente solo en la portada, arriba del todo y con el menú móvil cerrado
  const sobreFoto = pathname === '/' && !bajo && !abierto

  const claseEnlace = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-2 text-sm font-medium ${
      sobreFoto
        ? isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
        : isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`
  const botonPrimario = `boton rounded-full px-4 py-2 text-center text-sm font-semibold ${
    sobreFoto ? 'bg-cesped-200 text-gray-900 hover:bg-white' : 'bg-gray-900 text-white hover:bg-cesped-600'
  }`
  const botonSecundario = `rounded-full px-3.5 py-2 text-center text-sm font-medium ${
    sobreFoto ? 'text-white/85 hover:bg-white/10 hover:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  }`

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
    <header
      className={`sticky top-0 z-[1100] transition-colors duration-300 ${
        sobreFoto ? 'border-b border-transparent bg-transparent' : 'border-b border-gray-200 bg-white/90 backdrop-blur-md'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo claro={sobreFoto} />

        {/* Escritorio */}
        <div className="hidden items-center gap-1 md:flex">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace}>
              {e.label}
            </NavLink>
          ))}
          <span className={`mx-2 h-5 w-px ${sobreFoto ? 'bg-white/25' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-1">{acciones}</div>
        </div>

        {/* Botón del menú móvil */}
        <button
          className={`flex h-11 w-11 items-center justify-center rounded-full md:hidden ${sobreFoto ? 'text-white' : 'text-gray-800'}`}
          onClick={() => setAbierto(!abierto)}
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
        >
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Menú móvil */}
      {abierto && (
        <div className="flex flex-col gap-1 border-t border-gray-200 bg-white px-4 pb-5 pt-3 md:hidden [&>a]:py-3 [&>button]:py-3">
          {enlaces.map((e) => (
            <NavLink key={e.to} to={e.to} end className={claseEnlace} onClick={cerrar}>
              {e.label}
            </NavLink>
          ))}
          <div className="my-2 h-px bg-gray-200" />
          {acciones}
        </div>
      )}
    </header>
  )
}
