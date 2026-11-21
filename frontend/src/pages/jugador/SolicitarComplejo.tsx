import { useEffect, useState } from 'react'
import { Building2, Clock, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { COLUMNAS_COMPLEJO, type ComplejoPanel } from '../../lib/panel'
import { Alerta, Cargando } from '../../components/ui'
import FormComplejo from '../../components/FormComplejo'
import { BadgeComplejo } from '../propietario/Complejos'

/**
 * /jugador/solicitar-complejo: "solicitar ser propietario".
 * El jugador registra su complejo (queda 'pendiente'); cuando el admin lo
 * aprueba, el complejo pasa a 'activo' y el jugador a rol 'propietario'.
 * La foto se sube después, ya como propietario (Storage solo lo permite a ese rol).
 */
export default function SolicitarComplejo() {
  const { perfil } = useAuth()
  const [solicitudes, setSolicitudes] = useState<ComplejoPanel[] | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    supabase.from('complejos').select(COLUMNAS_COMPLEJO).eq('propietario_id', perfil!.id).order('created_at')
      .then(({ data }) => setSolicitudes((data ?? []) as ComplejoPanel[]))
  }, [perfil, recarga])

  if (!solicitudes) return <Cargando />

  return (
    <>
      <h1 className="mb-1 flex items-center gap-2 text-3xl font-semibold text-gray-900"><Building2 /> Registrar mi complejo</h1>
      <p className="mb-4 text-gray-600">
        ¿Tienes un complejo deportivo? Regístralo y un administrador lo revisará. Al aprobarlo tu cuenta pasará a
        <b> propietario</b>: podrás gestionar canchas, precios, agenda y ver tus métricas (te pediremos activar la verificación en dos pasos).
      </p>

      {solicitudes.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-gray-900">Mis solicitudes</h2>
          <ul className="space-y-2">
            {solicitudes.map((c) => (
              <li key={c.id} className="rounded-2xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">{c.nombre}</p>
                  <BadgeComplejo estado={c.estado} />
                </div>
                <p className="flex items-center gap-1 text-sm text-gray-600"><MapPin size={14} /> {c.direccion}, {c.distrito}</p>
                <p className="flex items-center gap-1 text-sm text-gray-600"><Clock size={14} /> {c.hora_apertura.slice(0, 5)} – {c.hora_cierre.slice(0, 5)}</p>
              </li>
            ))}
          </ul>
          {solicitudes.some((c) => c.estado === 'pendiente') && (
            <div className="mt-2"><Alerta tipo="info">Tu solicitud está en revisión. Te avisaremos cuando sea aprobada.</Alerta></div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 p-4">
        <h2 className="mb-3 font-semibold text-gray-900">{solicitudes.length ? 'Registrar otro complejo' : 'Datos del complejo'}</h2>
        <FormComplejo key={recarga} permitirFoto={false} onGuardado={() => setRecarga((n) => n + 1)} />
      </section>
    </>
  )
}
