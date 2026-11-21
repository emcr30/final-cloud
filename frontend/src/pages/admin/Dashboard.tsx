import { useEffect, useState } from 'react'
import { Building2, CalendarCheck, HandCoins, ShieldCheck, Users, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { soles } from '../../lib/canchas'
import { rangoPorDefecto, type Metricas, type Rango } from '../../lib/panel'
import { Alerta, Cargando } from '../../components/ui'
import {
  FiltroRango, GraficoCrecimiento, GraficoIngresos, GraficoTopComplejos, Kpi, Panel,
} from '../../components/Graficos'
import MapaComplejos from '../../components/MapaComplejos'

/** Lo que devuelve GET /admin/resumen. */
export interface ResumenAdmin {
  usuarios_por_rol: Record<string, number>
  usuarios_total: number
  usuarios_con_mfa: number
  usuarios_suspendidos: number
  complejos_por_estado: Record<string, number>
  crecimiento: { semana: string; nuevos: number; total: number }[]
}

/** Lo que devuelve GET /admin/complejos. */
export interface ComplejoAdmin {
  id: string
  nombre: string
  direccion: string
  distrito: string
  lat: number | null
  lng: number | null
  foto_url: string | null
  estado: 'pendiente' | 'activo' | 'suspendido'
  created_at: string
  propietario_id: string | null
  propietario: { nombre: string | null; email: string | null; rol: string | null }
  num_canchas: number
}

/**
 * /admin: métricas globales. Combina:
 *  - metricas() de Postgres (el admin, por RLS, ve TODOS los complejos),
 *  - GET /admin/resumen y /admin/complejos del backend (datos de Supabase Auth),
 *  - la comisión de la tabla configuracion.
 */
export default function AdminDashboard() {
  const { perfil } = useAuth()
  const [rango, setRango] = useState<Rango>(rangoPorDefecto)
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [resumen, setResumen] = useState<ResumenAdmin | null>(null)
  const [complejos, setComplejos] = useState<ComplejoAdmin[]>([])
  const [comision, setComision] = useState(10)
  const [error, setError] = useState('')

  useEffect(() => {
    api<ResumenAdmin>('/admin/resumen').then(setResumen).catch((e) => setError((e as Error).message))
    api<ComplejoAdmin[]>('/admin/complejos').then(setComplejos).catch(() => {})
    supabase.from('configuracion').select('comision_pct').eq('id', 1).maybeSingle()
      .then(({ data }) => data && setComision(Number(data.comision_pct)))
  }, [])

  useEffect(() => {
    supabase.rpc('metricas', { p_desde: rango.desde, p_hasta: rango.hasta, p_complejo_id: null })
      .then(({ data, error }) => {
        if (error) setError('No se pudieron cargar las métricas: ' + error.message)
        else setMetricas(data as Metricas)
      })
  }, [rango])

  const r = metricas?.resumen
  const rol = resumen?.usuarios_por_rol ?? {}
  const est = resumen?.complejos_por_estado ?? {}

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-gray-500">Hola, {perfil?.nombre.split(' ')[0]} 👋</p>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de la plataforma</h1>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <FiltroRango rango={rango} onCambio={setRango} />
      </div>
      {error && <div className="mb-4"><Alerta>{error}</Alerta></div>}

      {!metricas || !r || !resumen ? <Cargando texto="Calculando métricas…" /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icono={Users} titulo="Usuarios" valor={String(resumen.usuarios_total)}
              detalle={`${rol.jugador ?? 0} jugadores · ${rol.propietario ?? 0} propietarios · ${rol.admin ?? 0} admin`} />
            <Kpi icono={Building2} titulo="Complejos activos" valor={String(est.activo ?? 0)}
              detalle={`${est.pendiente ?? 0} pendientes · ${est.suspendido ?? 0} suspendidos`} />
            <Kpi icono={ShieldCheck} titulo="Usuarios con MFA" valor={String(resumen.usuarios_con_mfa)}
              detalle={`${resumen.usuarios_suspendidos} suspendidos`} />
            <Kpi icono={CalendarCheck} titulo="Reservas (rango)" valor={String(r.reservas)} detalle={`Ocupación global ${r.ocupacion}%`} />
            <Kpi icono={Wallet} titulo="Ingresos de complejos" valor={soles(r.ingresos)} detalle="Pagadas y completadas en el rango" />
            <Kpi icono={HandCoins} titulo={`Comisión plataforma (${comision}%)`} valor={soles((r.ingresos * comision) / 100)} detalle="Simulada · se cambia en Configuración" />
          </div>

          <Panel titulo="Ingresos de la plataforma por día">
            <GraficoIngresos datos={metricas.ingresos_diarios} />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel titulo="Top complejos por ingresos">
              <GraficoTopComplejos datos={metricas.por_complejo} />
            </Panel>
            <Panel titulo="Nuevos usuarios por semana">
              <GraficoCrecimiento datos={resumen.crecimiento} />
            </Panel>
          </div>
          <Panel titulo="Mapa de complejos">
            <MapaComplejos complejos={complejos.map((c) => ({ ...c, descripcion: null, hora_apertura: '', hora_cierre: '', canchas: [] }))}
              alto="h-80" conEnlace={false} />
          </Panel>
        </div>
      )}
    </>
  )
}
