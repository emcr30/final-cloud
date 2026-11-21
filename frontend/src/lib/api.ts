import { API_URL, supabase } from './supabase'

/**
 * Llama al backend FastAPI enviando el token de Supabase:
 *   Authorization: Bearer <access_token>
 * El backend valida el token y lee el rol desde `profiles`.
 */
export async function api<T = unknown>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  })

  const cuerpo = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    throw new Error((cuerpo as { detail?: string }).detail ?? `Error ${respuesta.status}`)
  }
  return cuerpo as T
}

/** Traduce los mensajes de error más comunes de Supabase Auth al español. */
export function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Debes confirmar tu correo antes de ingresar.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.'
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('invalid totp code') || m.includes('invalid mfa')) return 'Código incorrecto o vencido. Intenta de nuevo.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento.'
  if (m.includes('banned')) return 'Tu cuenta está suspendida. Contacta al administrador.'
  return mensaje
}
