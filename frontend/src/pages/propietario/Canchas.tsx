import { useEffect, useState, type FormEvent } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  NOMBRE_SUPERFICIE, NOMBRE_TIPO, soles, type Cancha, type Superficie, type TipoCancha,
} from '../../lib/canchas'
import { Alerta, claseInput } from '../../components/ui'

type DatosCancha = Pick<Cancha, 'nombre' | 'tipo' | 'superficie' | 'precio_hora' | 'activa'>
const VACIA: DatosCancha = { nombre: '', tipo: 'futbol7', superficie: 'sintetico', precio_hora: 100, activa: true }

/** Fila editable: los mismos campos para "nueva" y "editar". */
function FilaForm({ inicial, onGuardar, onCancelar }: {
  inicial: DatosCancha
  onGuardar: (d: DatosCancha) => Promise<void>
  onCancelar?: () => void
}) {
  const [d, setD] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    await onGuardar({ ...d, nombre: d.nombre.trim() })
    setGuardando(false)
  }
  const chico = `${claseInput} py-1.5 text-sm`
  return (
    <form onSubmit={enviar} className="grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto_auto] sm:items-end">
      <label className="text-xs text-gray-600">Nombre
        <input className={chico} required maxLength={40} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Cancha Misti" />
      </label>
      <label className="text-xs text-gray-600">Tipo
        <select className={chico} value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoCancha })}>
          {Object.entries(NOMBRE_TIPO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="text-xs text-gray-600">Superficie
        <select className={chico} value={d.superficie} onChange={(e) => setD({ ...d, superficie: e.target.value as Superficie })}>
          {Object.entries(NOMBRE_SUPERFICIE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="text-xs text-gray-600">Precio/hora (S/)
        <input className={chico} type="number" min={1} step="0.5" required value={d.precio_hora}
          onChange={(e) => setD({ ...d, precio_hora: Number(e.target.value) })} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
        <input type="checkbox" checked={d.activa} onChange={(e) => setD({ ...d, activa: e.target.checked })} /> Activa
      </label>
      <div className="flex gap-1">
        <button type="submit" disabled={guardando} className="inline-flex items-center gap-1 rounded-lg bg-cesped-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cesped-700 disabled:opacity-60">
          <Check size={16} /> {onCancelar ? 'Guardar' : 'Agregar'}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="rounded-lg border border-gray-300 px-2 py-2 text-gray-600 hover:bg-white" aria-label="Cancelar">
            <X size={16} />
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * CRUD de canchas de un complejo. Escribe directo en Supabase:
 * las políticas RLS solo permiten tocar canchas de complejos propios.
 */
export default function GestionCanchas({ complejoId }: { complejoId: string }) {
  const [canchas, setCanchas] = useState<Cancha[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    supabase.from('canchas').select('id, complejo_id, nombre, tipo, superficie, precio_hora, activa')
      .eq('complejo_id', complejoId).order('nombre')
      .then(({ data }) => setCanchas((data ?? []) as Cancha[]))
  }, [complejoId, recarga])
  const recargar = () => setRecarga((n) => n + 1)

  async function crear(d: DatosCancha) {
    const { error } = await supabase.from('canchas').insert({ ...d, complejo_id: complejoId })
    setMensaje(error ? { tipo: 'error', texto: error.message } : { tipo: 'exito', texto: `Cancha "${d.nombre}" agregada.` })
    recargar()
  }

  async function actualizar(id: string, d: DatosCancha) {
    const { error } = await supabase.from('canchas').update(d).eq('id', id)
    setMensaje(error ? { tipo: 'error', texto: error.message } : { tipo: 'exito', texto: 'Cancha actualizada.' })
    if (!error) setEditando(null)
    recargar()
  }

  /** Solo se elimina si nunca tuvo reservas (borrarla borraría el historial); si no, se desactiva. */
  async function eliminar(c: Cancha) {
    const { count } = await supabase.from('reservas').select('id', { count: 'exact', head: true }).eq('cancha_id', c.id)
    if (count) {
      setMensaje({ tipo: 'error', texto: `"${c.nombre}" tiene ${count} reservas en su historial: desactívala en lugar de eliminarla.` })
      return
    }
    if (!confirm(`¿Eliminar la cancha "${c.nombre}"?`)) return
    const { error } = await supabase.from('canchas').delete().eq('id', c.id)
    setMensaje(error ? { tipo: 'error', texto: error.message } : { tipo: 'exito', texto: 'Cancha eliminada.' })
    recargar()
  }

  return (
    <div className="space-y-3">
      {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
      {canchas.length === 0 && <p className="text-sm text-gray-500">Este complejo aún no tiene canchas.</p>}
      <ul className="divide-y divide-gray-100">
        {canchas.map((c) => (
          <li key={c.id} className="py-2">
            {editando === c.id ? (
              <FilaForm inicial={c} onGuardar={(d) => actualizar(c.id, d)} onCancelar={() => setEditando(null)} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {c.nombre}{' '}
                    {!c.activa && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">Inactiva</span>}
                  </p>
                  <p className="text-sm text-gray-600">{NOMBRE_TIPO[c.tipo]} · {NOMBRE_SUPERFICIE[c.superficie]} · <b>{soles(c.precio_hora)}</b>/hora</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditando(c.id)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm hover:bg-gray-50">
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => eliminar(c)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div>
        <p className="mb-1 flex items-center gap-1 text-sm font-semibold text-gray-700"><Plus size={14} /> Nueva cancha</p>
        <FilaForm key={canchas.length} inicial={VACIA} onGuardar={crear} />
      </div>
    </div>
  )
}
