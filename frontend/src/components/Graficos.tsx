import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fechaCorta, hoyLima, soles, sumarDias } from '../lib/canchas'
import { DIAS_CORTOS, horaTexto, type Metricas, type Rango } from '../lib/panel'
import { claseInput } from './ui'

/**
 * Piezas reutilizables de los dashboards (propietario y admin).
 * Una sola serie por gráfico → un solo color (verde césped); el heatmap usa
 * una escala secuencial del mismo verde (más oscuro = más reservas).
 */

const VERDE = '#16a34a'
const EJE = { fontSize: 12, fill: '#6b7280' }

/** Tarjeta con un número grande (KPI). */
export function Kpi({ icono: Icono, titulo, valor, detalle }: { icono: LucideIcon; titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="flex items-center gap-2 text-sm text-gray-500"><Icono size={16} /> {titulo}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-500">{detalle}</p>}
    </div>
  )
}

/** Recuadro con título para cada gráfico. */
export function Panel({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

/** Selector de rango de fechas con atajos. */
export function FiltroRango({ rango, onCambio }: { rango: Rango; onCambio: (r: Rango) => void }) {
  const hoy = hoyLima()
  const atajos: { texto: string; r: Rango }[] = [
    { texto: '7 días', r: { desde: sumarDias(hoy, -6), hasta: hoy } },
    { texto: '30 días', r: { desde: sumarDias(hoy, -29), hasta: hoy } },
    { texto: 'Este mes', r: { desde: `${hoy.slice(0, 8)}01`, hasta: hoy } },
    { texto: '90 días', r: { desde: sumarDias(hoy, -89), hasta: hoy } },
  ]
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-gray-600">Desde</span>
        <input type="date" className={`${claseInput} py-1.5`} value={rango.desde} max={rango.hasta}
          onChange={(e) => e.target.value && onCambio({ ...rango, desde: e.target.value })} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-gray-600">Hasta</span>
        <input type="date" className={`${claseInput} py-1.5`} value={rango.hasta} min={rango.desde}
          onChange={(e) => e.target.value && onCambio({ ...rango, hasta: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-1">
        {atajos.map(({ texto, r }) => {
          const activo = r.desde === rango.desde && r.hasta === rango.hasta
          return (
            <button key={texto} type="button" onClick={() => onCambio(r)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${activo ? 'bg-cesped-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {texto}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Caja del tooltip con el estilo de la app. */
function CajaTooltip({ titulo, lineas }: { titulo: string; lineas: string[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-gray-900">{titulo}</p>
      {lineas.map((l) => <p key={l} className="text-gray-600">{l}</p>)}
    </div>
  )
}

/** Barras de ingresos por día (con tooltip: ingresos y número de reservas). */
export function GraficoIngresos({ datos }: { datos: Metricas['ingresos_diarios'] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="fecha" tickFormatter={fechaCorta} tick={EJE} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `S/ ${v}`} />
          <Tooltip
            cursor={{ fill: '#f3f4f6' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as Metricas['ingresos_diarios'][number]
              return <CajaTooltip titulo={fechaCorta(d.fecha)} lineas={[`Ingresos: ${soles(d.ingresos)}`, `Reservas: ${d.reservas}`]} />
            }}
          />
          <Bar dataKey="ingresos" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras horizontales: % de ocupación por cancha. */
export function GraficoOcupacion({ datos, conComplejo }: { datos: Metricas['ocupacion_cancha']; conComplejo: boolean }) {
  const filas = datos.map((d) => ({ ...d, etiqueta: conComplejo ? `${d.cancha} · ${d.complejo}` : d.cancha, porcentaje: d.porcentaje ?? 0 }))
  return (
    <div style={{ height: Math.max(160, filas.length * 34 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" domain={[0, 100]} tick={EJE} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="etiqueta" tick={EJE} tickLine={false} axisLine={false} width={conComplejo ? 200 : 120} />
          <Tooltip
            cursor={{ fill: '#f3f4f6' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof filas)[number]
              return <CajaTooltip titulo={`${d.cancha} — ${d.complejo}`} lineas={[`Ocupación: ${d.porcentaje}%`, `Horas reservadas: ${d.horas}`]} />
            }}
          />
          <Bar dataKey="porcentaje" fill={VERDE} radius={[0, 4, 4, 0]} maxBarSize={18}
            label={{ position: 'right', fontSize: 12, fill: '#374151', formatter: (v: unknown) => `${v}%` }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Heatmap día de la semana × hora (horas pico). Recharts no trae heatmap,
 * así que es una grilla CSS: cada celda se pinta con la intensidad del verde.
 */
export function HeatmapHoras({ datos }: { datos: Metricas['horas_pico'] }) {
  if (!datos.length) return <p className="py-8 text-center text-sm text-gray-500">Sin reservas en el rango.</p>
  const horas = datos.map((d) => d.hora)
  const desde = Math.min(...horas)
  const hasta = Math.max(...horas)
  const max = Math.max(...datos.map((d) => d.reservas))
  const valor = (dia: number, hora: number) => datos.find((d) => d.dia === dia && d.hora === hora)?.reservas ?? 0
  const columnas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {columnas.map((h) => <th key={h} className="px-0.5 text-[10px] font-normal text-gray-500">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {DIAS_CORTOS.map((nombre, i) => (
            <tr key={nombre}>
              <th className="pr-2 text-left text-xs font-medium text-gray-600">{nombre}</th>
              {columnas.map((h) => {
                const v = valor(i + 1, h)
                const intensidad = v / max
                return (
                  <td key={h} title={`${nombre} ${horaTexto(h)}: ${v} reservas`}
                    className="h-7 w-7 min-w-7 rounded text-center text-[10px] hover:outline hover:outline-2 hover:outline-gray-900"
                    style={{
                      background: v ? `rgba(22, 163, 74, ${0.12 + intensidad * 0.88})` : '#f3f4f6',
                      color: intensidad > 0.55 ? 'white' : '#374151',
                    }}>
                    {v || ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        Menos
        <span className="h-3 w-24 rounded" style={{ background: 'linear-gradient(90deg, rgba(22,163,74,.12), rgba(22,163,74,1))' }} />
        Más · número = horas reservadas en ese día y hora
      </div>
    </div>
  )
}

/** Top complejos por ingresos (barras horizontales). */
export function GraficoTopComplejos({ datos }: { datos: Metricas['por_complejo'] }) {
  const filas = datos.filter((d) => d.ingresos > 0).slice(0, 8)
  if (!filas.length) return <p className="py-8 text-center text-sm text-gray-500">Sin ingresos en el rango.</p>
  return (
    <div style={{ height: Math.max(160, filas.length * 36 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" tick={EJE} tickLine={false} axisLine={false} tickFormatter={(v: number) => `S/ ${v}`} />
          <YAxis type="category" dataKey="complejo" tick={EJE} tickLine={false} axisLine={false} width={170} />
          <Tooltip
            cursor={{ fill: '#f3f4f6' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as Metricas['por_complejo'][number]
              return <CajaTooltip titulo={d.complejo} lineas={[`Ingresos: ${soles(d.ingresos)}`, `Reservas: ${d.reservas}`]} />
            }}
          />
          <Bar dataKey="ingresos" fill={VERDE} radius={[0, 4, 4, 0]} maxBarSize={18}
            label={{ position: 'right', fontSize: 12, fill: '#374151', formatter: (v: unknown) => soles(Number(v)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Nuevos usuarios por semana (el total acumulado va en el tooltip: un solo eje). */
export function GraficoCrecimiento({ datos }: { datos: { semana: string; nuevos: number; total: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="semana" tickFormatter={fechaCorta} tick={EJE} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={EJE} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: '#f3f4f6' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { semana: string; nuevos: number; total: number }
              return <CajaTooltip titulo={`Semana del ${fechaCorta(d.semana)}`} lineas={[`Nuevos: ${d.nuevos}`, `Total acumulado: ${d.total}`]} />
            }}
          />
          <Bar dataKey="nuevos" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
