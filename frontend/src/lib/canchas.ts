/**
 * Tipos y utilidades del flujo del jugador (buscar, reservar, mis reservas).
 * Todo lo relacionado con fechas usa la hora de Lima (UTC-5, sin horario de verano).
 */

export type TipoCancha = 'futbol5' | 'futbol7' | 'futbol11'
export type Superficie = 'sintetico' | 'natural' | 'losa'
export type EstadoReserva = 'pendiente_pago' | 'pagada' | 'cancelada' | 'completada'

export interface Cancha {
  id: string
  complejo_id: string
  nombre: string
  tipo: TipoCancha
  superficie: Superficie
  precio_hora: number
  activa: boolean
}

export interface Complejo {
  id: string
  nombre: string
  descripcion: string | null
  direccion: string
  distrito: string
  lat: number | null
  lng: number | null
  foto_url: string | null
  hora_apertura: string // 'HH:MM:SS'
  hora_cierre: string
  canchas: Cancha[]
}

/** Una fila de la RPC disponibilidad(cancha, fecha). */
export interface Franja {
  hora_inicio: string
  hora_fin: string
  disponible: boolean
}

/** Reserva con los datos de cancha y complejo (join de Supabase). */
export interface ReservaDetalle {
  id: string
  fecha: string // 'YYYY-MM-DD'
  hora_inicio: string
  hora_fin: string
  monto: number
  estado: EstadoReserva
  created_at: string
  cancha: {
    nombre: string
    tipo: TipoCancha
    complejo: { id: string; nombre: string; direccion: string; distrito: string } | null
  } | null
}

/** Columnas para leer reservas con su cancha y complejo en una sola consulta. */
export const SELECT_RESERVA =
  'id, fecha, hora_inicio, hora_fin, monto, estado, created_at, cancha:canchas(nombre, tipo, complejo:complejos(id, nombre, direccion, distrito))'

export const NOMBRE_TIPO: Record<TipoCancha, string> = {
  futbol5: 'Fútbol 5',
  futbol7: 'Fútbol 7',
  futbol11: 'Fútbol 11',
}

export const NOMBRE_SUPERFICIE: Record<Superficie, string> = {
  sintetico: 'Sintético',
  natural: 'Grass natural',
  losa: 'Losa',
}

export const ESTADO_RESERVA: Record<EstadoReserva, { texto: string; clase: string }> = {
  pendiente_pago: { texto: 'Pendiente de pago', clase: 'bg-amber-100 text-amber-800' },
  pagada: { texto: 'Pagada', clase: 'bg-cesped-100 text-cesped-800' },
  cancelada: { texto: 'Cancelada', clase: 'bg-gray-200 text-gray-600' },
  completada: { texto: 'Completada', clase: 'bg-blue-100 text-blue-800' },
}

/** Centro de Lima, para centrar el mapa cuando no hay otra referencia. */
export const CENTRO_LIMA: [number, number] = [-12.07, -77.03]

/** 80 → "S/ 80.00" */
export function soles(monto: number) {
  return `S/ ${Number(monto).toFixed(2)}`
}

/** '08:00:00' → '08:00' */
export function hhmm(hora: string) {
  return hora.slice(0, 5)
}

/** Fecha de hoy en Lima como 'YYYY-MM-DD' (en-CA usa ese formato). */
export function hoyLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

/** Suma días a una fecha 'YYYY-MM-DD' sin problemas de zona horaria. */
export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Instante real de una fecha + hora de Lima (Perú está siempre en UTC-5). */
export function instanteLima(fecha: string, hora: string) {
  return new Date(`${fecha}T${hhmm(hora)}:00-05:00`)
}

/** '2026-11-21' → 'sáb 21 nov' */
export function fechaCorta(fecha: string) {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-PE', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** '2026-11-21' → 'sábado, 21 de noviembre de 2026' */
export function fechaLarga(fecha: string) {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/**
 * Distancia en km entre dos puntos (fórmula de Haversine).
 * Considera la curvatura de la Tierra (radio medio 6371 km).
 */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** El jugador puede cancelar si la reserva sigue vigente y faltan más de 2 horas. */
export function puedeCancelar(r: Pick<ReservaDetalle, 'estado' | 'fecha' | 'hora_inicio'>) {
  if (r.estado !== 'pendiente_pago' && r.estado !== 'pagada') return false
  const faltaMs = instanteLima(r.fecha, r.hora_inicio).getTime() - Date.now()
  return faltaMs > 2 * 60 * 60 * 1000
}

/** Traduce los errores de Postgres al reservar a mensajes claros. */
export function errorReserva(error: { code?: string; message: string }) {
  // 23P01 = exclusion_violation: la restricción EXCLUDE detectó un solapamiento
  if (error.code === '23P01') return 'Ese horario acaba de ser tomado. Elige otro, por favor.'
  if (error.code === '42501') return 'No tienes permiso para esta acción.'
  return error.message
}
