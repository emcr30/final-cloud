import { Link } from 'react-router-dom'

/** Página 404 para rutas que no existen (o que aún no se implementan). */
export default function NoEncontrado() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-cesped-600">404</p>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">Página no encontrada</h1>
      <p className="mt-2 text-gray-600">La página que buscas no existe o aún está en construcción.</p>
      <Link to="/" className="mt-6 inline-block rounded-full bg-gray-900 px-5 py-2.5 font-semibold text-white hover:bg-cesped-600">
        Volver al inicio
      </Link>
    </div>
  )
}
