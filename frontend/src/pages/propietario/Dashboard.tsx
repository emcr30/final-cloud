import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, FileDown, FileSpreadsheet, Gauge, Wallet, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { descargar } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { soles } from '../../lib/canchas'
import { rangoPorDefecto, type Metricas, type Rango } from '../../lib/panel'
import { Alerta, Cargando, claseInput } from '../../components/ui'
import { FiltroRango, GraficoIngresos, GraficoOcupacion, HeatmapHoras, Kpi, Panel } from '../../components/Graficos'

/**
 * /propietario: dashboard de SUS complejos.
 * Los números vienen de la función metricas() de Postgres (security invoker):
 * RLS garantiza que un propietario solo recibe datos de sus complejos.
 */
export default function PropietarioDashboard() {
  const { perfil } = useAuth()
  const [complejos, setComplejos] = useState<{ id: string; nombre: string }[]>([])
  const [complejoId, setComplejoId] = useState('')
  const [rango, setRango] = useState<Rango>(rangoPorDefecto)
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [error, setError] = useState('')
  const [exportando, setExportando] = useState<'' | 'csv' | 'pdf'>('')

  useEffect(() => {
    supabase.from('complejos').select('id, nombre').eq('propietario_id', perfil!.id).order('nombre')
      .then(({ data }) => setComplejos(data ?? []))
  }, [perfil])

  useEffect(() => {
    supabase.rpc('metricas', { p_desde: rango.desde, p_hasta: rango.hasta, p_complejo_id: complejoId || null })
      .then(({ data, error }) => {
        if (error) setError('No se pudieron cargar las métricas: ' + error.message)
        else setMetricas(data as Metricas)
      })
  }, [rango, complejoId])

  async function exportar(formato: 'csv' | 'pdf') {
    setExportando(formato)
    setError('')
    const params = new URLSearchParams({ formato, desde: rango.desde, hasta: rango.hasta })
    if (complejoId) params.set('complejo_id', complejoId)
    try {
      await descargar(`/reportes/export?${params}`, `reservas_${rango.desde}_${rango.hasta}.${formato}`)
    } catch (e) {
      setError(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setExportando('')
    }
  }

  const r = metricas?.resumen
  const claseExportar = 'inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60'

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-gray-500">Hola, {perfil?.nombre.split(' ')[0]} 👋</p>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard de mis complejos</h1>
      </div>

      {/* Filtros en una sola fila, arriba de todo */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Complejo</span>
            <select className={`${claseInput} py-1.5`} value={complejoId} onChange={(e) => setComplejoId(e.target.value)}>
              <option value="">Todos mis complejos</option>
              {complejos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <FiltroRango rango={rango} onCambio={setRango} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportar('csv')} disabled={!!exportando} className={claseExportar}>
            <FileSpreadsheet size={16} /> {exportando === 'csv' ? 'Generando…' : 'CSV'}
          </button>
          <button onClick={() => exportar('pdf')} disabled={!!exportando} className={claseExportar}>
            <FileDown size={16} /> {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4"><Alerta>{error}</Alerta></div>}

      {!metricas || !r ? <Cargando texto="Calculando métricas…" /> : complejos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-600">
          Aún no tienes complejos. <Link to="/propietario/complejos/nuevo" className="font-semibold text-cesped-700 hover:underline">Registra el primero</Link>.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icono={Wallet} titulo="Ingresos" valor={soles(r.ingresos)} detalle="Reservas pagadas y completadas" />
            <Kpi icono={CalendarCheck} titulo="Reservas" valor={String(r.reservas)} detalle={`${r.horas_reservadas} horas reservadas`} />
            <Kpi icono={Gauge} titulo="Ocupación" valor={`${r.ocupacion}%`} detalle="Horas reservadas / horas abiertas" />
            <Kpi icono={XCircle} titulo="Canceladas" valor={String(r.canceladas)} detalle={`${r.bloqueos} bloqueos internos`} />
          </div>
          <Panel titulo="Ingresos por día">
            <GraficoIngresos datos={metricas.ingresos_diarios} />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel titulo="Ocupación por cancha">
              <GraficoOcupacion datos={metricas.ocupacion_cancha} conComplejo={!complejoId} />
            </Panel>
            <Panel titulo="Horas pico (día × hora)">
              <HeatmapHoras datos={metricas.horas_pico} />
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
