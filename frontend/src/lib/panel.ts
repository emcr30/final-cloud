/**
 * Tipos y utilidades de los paneles de propietario y admin.
 */
import { hoyLima, sumarDias, type Cancha } from './canchas'

export type EstadoComplejo = 'pendiente' | 'activo' | 'suspendido'

/** Complejo tal como lo ve su dueño o el admin (incluye estado). */
export interface ComplejoPanel {
  id: string
  propietario_id: string | null
  nombre: string
  descripcion: string | null
  direccion: string
  distrito: string
  lat: number | null
  lng: number | null
  foto_url: string | null
  hora_apertura: string
  hora_cierre: string
  estado: EstadoComplejo
  created_at: string
  canchas?: Cancha[]
}

export const COLUMNAS_COMPLEJO =
  'id, propietario_id, nombre, descripcion, direccion, distrito, lat, lng, foto_url, hora_apertura, hora_cierre, estado, created_at'

export const ESTADO_COMPLEJO: Record<EstadoComplejo, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente de aprobación', clase: 'bg-amber-100 text-amber-800' },
  activo: { texto: 'Activo', clase: 'bg-cesped-100 text-cesped-800' },
  suspendido: { texto: 'Suspendido', clase: 'bg-red-100 text-red-700' },
}

/** Distritos de Arequipa para sugerir en el formulario (se puede escribir otro). */
export const DISTRITOS_AREQUIPA = [
  'Arequipa (Cercado)', 'Alto Selva Alegre', 'Cayma', 'Cerro Colorado', 'Jacobo Hunter',
  'José Luis Bustamante y Rivero', 'Mariano Melgar', 'Miraflores', 'Paucarpata', 'Sachaca',
  'Socabaya', 'Tiabaya', 'Yanahuara', 'Yura',
]

/** Respuesta de la función metricas(desde, hasta, complejo) de Postgres. */
export interface Metricas {
  resumen: {
    ingresos: number
    reservas: number
    canceladas: number
    pendientes: number
    bloqueos: number
    horas_reservadas: number
    ocupacion: number
  }
  ingresos_diarios: { fecha: string; ingresos: number; reservas: number }[]
  ocupacion_cancha: { cancha: string; complejo: string; horas: number; porcentaje: number | null }[]
  horas_pico: { dia: number; hora: number; reservas: number }[]
  por_complejo: { complejo_id: string; complejo: string; ingresos: number; reservas: number }[]
}

export interface Rango { desde: string; hasta: string }

/** Últimos 30 días hasta hoy (hora de Lima). */
export function rangoPorDefecto(): Rango {
  const hoy = hoyLima()
  return { desde: sumarDias(hoy, -29), hasta: hoy }
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. */
export function lunesDe(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`)
  const dia = (d.getUTCDay() + 6) % 7 // 0 = lunes
  return sumarDias(fecha, -dia)
}

/** '08:00:00' → 8 */
export function horaNum(hora: string) {
  return Number(hora.slice(0, 2))
}

/** 8 → '08:00' */
export function horaTexto(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
