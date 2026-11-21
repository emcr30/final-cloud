/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Rol = 'admin' | 'propietario' | 'jugador'

export interface Perfil {
  id: string
  nombre: string
  telefono: string | null
  rol: Rol
}

/**
 * Estado de MFA de la sesión:
 * - nivelActual: 'aal1' = solo contraseña, 'aal2' = contraseña + código TOTP.
 * - tieneFactor: el usuario ya configuró una app autenticadora (factor verificado).
 */
export interface EstadoMfa {
  nivelActual: 'aal1' | 'aal2' | null
  tieneFactor: boolean
}

interface AuthCtx {
  session: Session | null
  perfil: Perfil | null
  mfa: EstadoMfa
  cargando: boolean
  /** Vuelve a leer perfil y estado MFA (p. ej. tras verificar el código o editar datos). */
  refrescar: () => Promise<void>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

/** Roles para los que el MFA es obligatorio (CLAUDE.md). */
export const ROLES_CON_MFA: Rol[] = ['admin', 'propietario']

/** Panel de inicio de cada rol (a dónde se redirige tras iniciar sesión). */
export function rutaPanel(rol: Rol | undefined) {
  if (rol === 'admin') return '/admin'
  if (rol === 'propietario') return '/propietario'
  return '/jugador'
}

/**
 * ¿A qué pantalla de MFA debe ir este usuario antes de entrar a su panel?
 * - admin/propietario sin factor → configurar (obligatorio).
 * - cualquiera con factor y sesión aal1 → verificar el código.
 * - null → puede pasar.
 */
export function pasoMfaPendiente(perfil: Perfil | null, mfa: EstadoMfa): '/mfa/configurar' | '/mfa/verificar' | null {
  if (!perfil) return null
  if (mfa.tieneFactor && mfa.nivelActual !== 'aal2') return '/mfa/verificar'
  if (!mfa.tieneFactor && ROLES_CON_MFA.includes(perfil.rol)) return '/mfa/configurar'
  return null
}

async function leerPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, telefono, rol')
    .eq('id', userId)
    .maybeSingle()
  if (error) console.error('[CanchaYa] No se pudo leer el perfil:', error.message)
  return data as Perfil | null
}

async function leerMfa(): Promise<EstadoMfa> {
  // El nivel AAL viene dentro del JWT de la sesión; listFactors dice si hay TOTP verificado
  const [{ data: aal }, { data: factores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  return {
    nivelActual: (aal?.currentLevel as EstadoMfa['nivelActual']) ?? null,
    tieneFactor: (factores?.totp.length ?? 0) > 0, // totp solo incluye factores verificados
  }
}

/** Provee sesión, perfil (rol) y estado MFA a toda la app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [mfa, setMfa] = useState<EstadoMfa>({ nivelActual: null, tieneFactor: false })
  const [cargando, setCargando] = useState(true)

  const cargarDatos = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null)
      setMfa({ nivelActual: null, tieneFactor: false })
      setCargando(false)
      return
    }
    const [p, m] = await Promise.all([leerPerfil(s.user.id), leerMfa()])
    setPerfil(p)
    setMfa(m)
    setCargando(false)
  }, [])

  useEffect(() => {
    // Sesión guardada en el navegador (localStorage) al recargar la página
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      cargarDatos(data.session)
    })

    // Cambios: login, logout, refresco de token, verificación MFA (el token pasa a aal2)
    const { data: sub } = supabase.auth.onAuthStateChange((evento, nueva) => {
      setSession(nueva)
      if (evento === 'TOKEN_REFRESHED') return // mismo usuario y mismo nivel: nada que recargar
      // setTimeout: Supabase recomienda no llamar a su API dentro del callback (evita bloqueos)
      setTimeout(() => cargarDatos(nueva), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [cargarDatos])

  const refrescar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await cargarDatos(data.session)
  }, [cargarDatos])

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, perfil, mfa, cargando, refrescar, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
