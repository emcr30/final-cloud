import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Clock, MapPin, Pencil, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { hhmm } from '../../lib/canchas'
import { COLUMNAS_COMPLEJO, ESTADO_COMPLEJO, type ComplejoPanel } from '../../lib/panel'
import { Alerta, Cargando } from '../../components/ui'
import FotoComplejo from '../../components/FotoComplejo'
import FormComplejo from '../../components/FormComplejo'
import GestionCanchas from './Canchas'

export function BadgeComplejo({ estado }: { estado: ComplejoPanel['estado'] }) {
  const { texto, clase } = ESTADO_COMPLEJO[estado]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${clase}`}>{texto}</span>
}

/** /propietario/complejos: lista de MIS complejos (RLS: propietario_id = yo). */
export default function MisComplejos() {
  const { perfil } = useAuth()
  const [complejos, setComplejos] = useState<ComplejoPanel[] | null>(null)

  useEffect(() => {
    supabase.from('complejos').select(`${COLUMNAS_COMPLEJO}, canchas(id, activa)`)
      .eq('propietario_id', perfil!.id).order('created_at')
      .then(({ data }) => setComplejos((data ?? []) as unknown as ComplejoPanel[]))
  }, [perfil])

  if (!complejos) return <Cargando />

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-gray-900">Mis complejos</h1>
        <Link to="/propietario/complejos/nuevo" className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-cesped-600">
          <Plus size={16} /> Nuevo complejo
        </Link>
      </div>

      {complejos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          <Building2 className="mx-auto mb-2" /> Todavía no registraste ningún complejo.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {complejos.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-2xl border border-gray-200">
              <FotoComplejo url={c.foto_url} nombre={c.nombre} className="h-32" />
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-gray-900">{c.nombre}</h2>
                  <BadgeComplejo estado={c.estado} />
                </div>
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-600"><MapPin size={14} /> {c.direccion}, {c.distrito}</p>
                <p className="flex items-center gap-1 text-sm text-gray-600"><Clock size={14} /> {hhmm(c.hora_apertura)} – {hhmm(c.hora_cierre)}</p>
                <p className="text-sm text-gray-600">
                  {c.canchas?.filter((k) => k.activa).length ?? 0} canchas activas de {c.canchas?.length ?? 0}
                </p>
                <Link to={`/propietario/complejos/${c.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cesped-700 hover:underline">
                  <Pencil size={14} /> Editar datos y canchas
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** /propietario/complejos/nuevo y /propietario/complejos/:id */
export function EditarComplejo() {
  const { id } = useParams()
  // key = id: al pasar de "nuevo" al id recién creado, el editor se monta de cero
  return <EditorComplejo key={id} id={id!} />
}

function EditorComplejo({ id }: { id: string }) {
  const navigate = useNavigate()
  const nuevo = id === 'nuevo'
  const [complejo, setComplejo] = useState<ComplejoPanel | null>(null)
  const [cargando, setCargando] = useState(!nuevo)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (nuevo) return
    supabase.from('complejos').select(COLUMNAS_COMPLEJO).eq('id', id).maybeSingle()
      .then(({ data }) => {
        setComplejo(data as ComplejoPanel | null)
        setCargando(false)
      })
  }, [id, nuevo])

  if (cargando) return <Cargando />
  if (!nuevo && !complejo) return <Alerta>No se encontró el complejo (o no es tuyo).</Alerta>

  return (
    <>
      <Link to="/propietario/complejos" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={16} /> Mis complejos
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold text-gray-900">{nuevo ? 'Registrar complejo' : complejo!.nombre}</h1>
        {complejo && <BadgeComplejo estado={complejo.estado} />}
      </div>
      {aviso && <div className="mb-4"><Alerta tipo="exito">{aviso}</Alerta></div>}

      <section className="rounded-2xl border border-gray-200 p-4">
        <h2 className="mb-3 font-semibold text-gray-900">Datos del complejo</h2>
        <FormComplejo
          key={complejo?.id ?? 'nuevo'}
          complejo={complejo ?? undefined}
          onGuardado={(c) => {
            if (nuevo) {
              navigate(`/propietario/complejos/${c.id}`, { replace: true })
            } else {
              setComplejo(c)
              setAviso('Cambios guardados.')
            }
          }}
        />
      </section>

      {complejo && (
        <section className="mt-6 rounded-2xl border border-gray-200 p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Canchas</h2>
          <GestionCanchas complejoId={complejo.id} />
        </section>
      )}
    </>
  )
}
