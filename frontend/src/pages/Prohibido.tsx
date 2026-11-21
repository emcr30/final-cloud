import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { rutaPanel, useAuth } from '../context/AuthContext'

/** 403: el usuario está logueado pero su rol no tiene acceso a esa sección. */
export default function Prohibido() {
  const { perfil } = useAuth()
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
        <ShieldAlert className="text-red-500" size={40} />
      </div>
      <p className="mt-6 text-6xl font-extrabold text-gray-900">403</p>
      <h1 className="mt-2 text-3xl font-semibold text-gray-900">Acceso restringido</h1>
      <p className="mt-2 text-gray-600">
        Esta sección no está disponible para tu tipo de cuenta. Cada usuario solo ve lo que le corresponde.
      </p>
      <Link
        to={perfil ? rutaPanel(perfil.rol) : '/'}
        className="mt-6 inline-block rounded-full bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-cesped-600"
      >
        {perfil ? 'Ir a mi panel' : 'Volver al inicio'}
      </Link>
    </div>
  )
}
