import { useState, type FormEvent } from 'react'
import { ImagePlus, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { DISTRITOS_AREQUIPA, horaTexto, type ComplejoPanel } from '../lib/panel'
import { Alerta, Campo, claseBoton, claseInput } from './ui'
import SelectorUbicacion from './SelectorUbicacion'
import FotoComplejo from './FotoComplejo'

const HORAS = Array.from({ length: 24 }, (_, h) => h) // 0..23
/** Tamaño máximo de la foto (igual que el límite del bucket en Storage). */
const MAX_FOTO_MB = 5

interface Props {
  /** Complejo a editar; si no viene, se crea uno nuevo (queda 'pendiente'). */
  complejo?: ComplejoPanel
  /** Solo propietarios y admin pueden subir fotos (política de Storage). */
  permitirFoto?: boolean
  onGuardado: (c: ComplejoPanel) => void
}

/**
 * Formulario de complejo (crear / editar). Escribe directo en Supabase:
 * RLS deja insertar solo complejos propios en estado 'pendiente' y editar
 * solo los propios; el estado lo cambia únicamente el admin.
 */
export default function FormComplejo({ complejo, permitirFoto = true, onGuardado }: Props) {
  const { session } = useAuth()
  const [datos, setDatos] = useState({
    nombre: complejo?.nombre ?? '',
    descripcion: complejo?.descripcion ?? '',
    direccion: complejo?.direccion ?? '',
    distrito: complejo?.distrito ?? '',
    hora_apertura: Number(complejo?.hora_apertura.slice(0, 2) ?? 8),
    hora_cierre: Number(complejo?.hora_cierre.slice(0, 2) ?? 23),
    lat: complejo?.lat ?? null,
    lng: complejo?.lng ?? null,
  })
  const [foto, setFoto] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(complejo?.foto_url ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cambiar = (campo: keyof typeof datos, valor: string | number | null) => setDatos((d) => ({ ...d, [campo]: valor }))

  function elegirFoto(archivo: File | undefined) {
    if (!archivo) return
    if (archivo.size > MAX_FOTO_MB * 1024 * 1024) return setError(`La foto debe pesar menos de ${MAX_FOTO_MB} MB.`)
    setError('')
    setFoto(archivo)
    setVistaPrevia(URL.createObjectURL(archivo))
  }

  /** Sube la foto a Storage (bucket público 'complejos') y devuelve su URL pública. */
  async function subirFoto(complejoId: string, archivo: File) {
    const ext = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const ruta = `${session!.user.id}/${complejoId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('complejos').upload(ruta, archivo, { contentType: archivo.type })
    if (error) throw new Error('No se pudo subir la foto: ' + error.message)
    return supabase.storage.from('complejos').getPublicUrl(ruta).data.publicUrl
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (datos.hora_cierre <= datos.hora_apertura) return setError('La hora de cierre debe ser posterior a la de apertura.')
    if (datos.lat == null || datos.lng == null) return setError('Marca la ubicación del complejo en el mapa.')
    setGuardando(true)
    setError('')
    const fila = {
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim() || null,
      direccion: datos.direccion.trim(),
      distrito: datos.distrito.trim(),
      hora_apertura: horaTexto(datos.hora_apertura),
      hora_cierre: horaTexto(datos.hora_cierre),
      lat: datos.lat,
      lng: datos.lng,
    }
    try {
      // 1) Crear o actualizar los datos
      const consulta = complejo
        ? supabase.from('complejos').update(fila).eq('id', complejo.id)
        : supabase.from('complejos').insert({ ...fila, propietario_id: session!.user.id, estado: 'pendiente' })
      const { data, error } = await consulta.select().single()
      if (error) throw new Error(error.message)
      let guardado = data as ComplejoPanel

      // 2) Foto (necesita el id, por eso va después)
      if (foto) {
        const url = await subirFoto(guardado.id, foto)
        const r = await supabase.from('complejos').update({ foto_url: url }).eq('id', guardado.id).select().single()
        if (r.error) throw new Error(r.error.message)
        guardado = r.data as ComplejoPanel
      }
      onGuardado(guardado)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {error && <Alerta>{error}</Alerta>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nombre del complejo" required maxLength={80} value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Distrito</span>
          <input className={claseInput} required list="distritos" value={datos.distrito} onChange={(e) => cambiar('distrito', e.target.value)} />
          <datalist id="distritos">{DISTRITOS_AREQUIPA.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
      </div>
      <Campo label="Dirección" required maxLength={120} value={datos.direccion} onChange={(e) => cambiar('direccion', e.target.value)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
        <textarea className={claseInput} rows={3} maxLength={500} value={datos.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)}
          placeholder="Estacionamiento, vestuarios, iluminación LED…" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        {(['hora_apertura', 'hora_cierre'] as const).map((campo) => (
          <label key={campo} className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{campo === 'hora_apertura' ? 'Abre a las' : 'Cierra a las'}</span>
            <select className={claseInput} value={datos[campo]} onChange={(e) => cambiar(campo, Number(e.target.value))}>
              {HORAS.filter((h) => campo === 'hora_apertura' || h > 0).map((h) => (
                <option key={h} value={h}>{horaTexto(h)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">Ubicación</span>
        <SelectorUbicacion lat={datos.lat} lng={datos.lng} onElegir={(lat, lng) => setDatos((d) => ({ ...d, lat, lng }))} />
      </div>

      {permitirFoto && (
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Foto</span>
          <div className="flex flex-wrap items-center gap-4">
            <FotoComplejo url={vistaPrevia} nombre={datos.nombre || 'C'} className="h-24 w-40 rounded-lg" />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50">
              <ImagePlus size={16} /> Elegir imagen
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => elegirFoto(e.target.files?.[0])} />
            </label>
            <span className="text-xs text-gray-500">JPG, PNG o WEBP, máx. {MAX_FOTO_MB} MB</span>
          </div>
        </div>
      )}

      <button type="submit" disabled={guardando} className={`${claseBoton} sm:w-auto`}>
        <Save size={18} /> {guardando ? 'Guardando…' : complejo ? 'Guardar cambios' : 'Registrar complejo'}
      </button>
      {!complejo && <p className="text-xs text-gray-500">El complejo quedará <b>pendiente</b> hasta que el administrador lo apruebe.</p>}
    </form>
  )
}
