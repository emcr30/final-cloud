import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, MapPin, PauseCircle, RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { ESTADO_COMPLEJO, type EstadoComplejo } from '../../lib/panel'
import { Alerta, Cargando } from '../../components/ui'
import FotoComplejo from '../../components/FotoComplejo'
import { BadgeComplejo } from '../propietario/Complejos'
import type { ComplejoAdmin } from './Dashboard'

const PESTANAS: (EstadoComplejo | 'todos')[] = ['pendiente', 'activo', 'suspendido', 'todos']

/**
 * /admin/complejos: aprobar solicitudes (pendiente → activo, y el dueño pasa
 * a propietario), suspender o reactivar complejos. Vía backend (service role).
 */
export default function AdminComplejos() {
  const [complejos, setComplejos] = useState<ComplejoAdmin[] | null>(null)
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]>('pendiente')
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    api<ComplejoAdmin[]>('/admin/complejos').then(setComplejos)
      .catch((e) => setMensaje({ tipo: 'error', texto: (e as Error).message }))
  }, [recarga])

  async function cambiarEstado(c: ComplejoAdmin, estado: EstadoComplejo) {
    if (estado === 'suspendido' && !confirm(`¿Suspender "${c.nombre}"? Dejará de aparecer en la búsqueda y no aceptará reservas nuevas.`)) return
    setOcupado(c.id)
    setMensaje(null)
    try {
      const r = await api<{ dueno_ahora_es_propietario: boolean }>(`/admin/complejos/${c.id}/estado`, {
        method: 'PATCH', body: JSON.stringify({ estado }),
      })
      setMensaje({
        tipo: 'exito',
        texto: `"${c.nombre}" ahora está ${ESTADO_COMPLEJO[estado].texto.toLowerCase()}.` +
          (r.dueno_ahora_es_propietario ? ` ${c.propietario.nombre ?? 'El dueño'} pasó a rol propietario (deberá configurar MFA).` : ''),
      })
      setRecarga((n) => n + 1)
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setOcupado(null)
    }
  }

  if (!complejos) return <Cargando />
  const cuenta = (e: EstadoComplejo) => complejos.filter((c) => c.estado === e).length
  const lista = pestana === 'todos' ? complejos : complejos.filter((c) => c.estado === pestana)
  const boton = 'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60'

  return (
    <>
      <h1 className="mb-4 text-3xl font-semibold text-gray-900">Complejos</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {PESTANAS.map((p) => (
          <button key={p} onClick={() => setPestana(p)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${pestana === p ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {p === 'todos' ? `Todos (${complejos.length})` : `${ESTADO_COMPLEJO[p].texto.split(' ')[0]}s (${cuenta(p)})`}
          </button>
        ))}
      </div>
      {mensaje && <div className="mb-3"><Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta></div>}

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">No hay complejos en esta lista.</p>
      ) : (
        <ul className="space-y-3">
          {lista.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-3 sm:flex-row sm:items-center">
              <FotoComplejo url={c.foto_url} nombre={c.nombre} className="h-20 rounded-lg sm:w-32 sm:shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">{c.nombre}</p>
                  <BadgeComplejo estado={c.estado} />
                </div>
                <p className="flex items-center gap-1 text-sm text-gray-600"><MapPin size={14} /> {c.direccion}, {c.distrito}</p>
                <p className="text-sm text-gray-600">
                  Dueño: <b>{c.propietario.nombre ?? '—'}</b> · {c.propietario.email ?? 'sin dueño'}
                  {c.propietario.rol && <span className="text-gray-500"> ({c.propietario.rol})</span>} · {c.num_canchas} canchas
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {c.estado === 'activo' && (
                  <Link to={`/canchas/${c.id}`} className={`${boton} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
                    <ExternalLink size={14} /> Ver
                  </Link>
                )}
                {c.estado !== 'activo' && (
                  <button disabled={ocupado === c.id} onClick={() => cambiarEstado(c, 'activo')} className={`${boton} bg-gray-900 text-white hover:bg-cesped-600`}>
                    {c.estado === 'pendiente' ? <><CheckCircle2 size={14} /> Aprobar</> : <><RotateCcw size={14} /> Reactivar</>}
                  </button>
                )}
                {c.estado !== 'suspendido' && (
                  <button disabled={ocupado === c.id} onClick={() => cambiarEstado(c, 'suspendido')} className={`${boton} border border-red-200 text-red-600 hover:bg-red-50`}>
                    <PauseCircle size={14} /> {c.estado === 'pendiente' ? 'Rechazar' : 'Suspender'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
