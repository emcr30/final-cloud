import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Construction, ServerCog } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { Alerta } from '../../components/ui'

/**
 * Páginas de inicio de cada panel (provisionales).
 * Se completan en: Parte 4 (jugador), Parte 6 (propietario) y Parte 7 (admin).
 */

function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  const { perfil } = useAuth()
  return (
    <div className="mb-6">
      <p className="text-sm text-gray-500">Hola, {perfil?.nombre.split(' ')[0]} 👋</p>
      <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
      <p className="mt-1 text-gray-600">{texto}</p>
    </div>
  )
}

/** Botón que llama al backend para demostrar la validación del token y del rol. */
function ProbarBackend({ ruta }: { ruta: string }) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  async function probar() {
    try {
      setResultado({ ok: true, texto: JSON.stringify(await api(ruta)) })
    } catch (e) {
      setResultado({ ok: false, texto: (e as Error).message })
    }
  }
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <button onClick={probar} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50">
        <ServerCog size={16} /> Probar backend: GET {ruta}
      </button>
      {resultado && (
        <div className="mt-3">
          <Alerta tipo={resultado.ok ? 'exito' : 'error'}>
            <code className="break-all text-xs">{resultado.texto}</code>
          </Alerta>
        </div>
      )}
    </div>
  )
}

export function JugadorInicio() {
  return (
    <>
      <Encabezado titulo="Mi panel" texto="Aquí verás tu próxima reserva, lo gastado y tus reservas del mes." />
      <Link to="/canchas" className="inline-block rounded-lg bg-cesped-600 px-5 py-2.5 font-semibold text-white hover:bg-cesped-700">
        Buscar canchas
      </Link>
      <div className="mt-6"><ProbarBackend ruta="/me" /></div>
    </>
  )
}

export function PropietarioInicio() {
  return (
    <>
      <Encabezado titulo="Dashboard del complejo" texto="Métricas de ocupación e ingresos de tus complejos." />
      <ProbarBackend ruta="/me" />
    </>
  )
}

export function AdminInicio() {
  return (
    <>
      <Encabezado titulo="Dashboard de la plataforma" texto="Métricas globales, usuarios y complejos." />
      {/* /me/admin exige rol admin + sesión AAL2 en el backend (require_role) */}
      <ProbarBackend ruta="/me/admin" />
    </>
  )
}

/** Para opciones del menú que aún no se implementan. */
export function EnConstruccion() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
      <Construction className="mx-auto mb-2" />
      Esta sección se implementa en una próxima parte del proyecto.
    </div>
  )
}
