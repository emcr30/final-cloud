import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { pasoMfaPendiente, useAuth, type Rol } from '../context/AuthContext'
import { Cargando } from './ui'

/**
 * Protege un grupo de rutas. Orden de controles:
 *  1. ¿Hay sesión?            no → /login (recordando a dónde quería ir)
 *  2. ¿Falta un paso de MFA?  sí → /mfa/configurar o /mfa/verificar
 *  3. ¿Tiene el rol?          no → /403
 * Importante: esto es solo experiencia de usuario. La seguridad real está en
 * RLS (Postgres) y en require_role/require_aal2 (backend).
 */
export default function RutaProtegida({ roles }: { roles?: Rol[] }) {
  const { session, perfil, mfa, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />
  if (!perfil) return <Cargando texto="Cargando tu perfil…" />

  const pasoMfa = pasoMfaPendiente(perfil, mfa)
  if (pasoMfa) return <Navigate to={pasoMfa} replace state={{ desde: ubicacion.pathname }} />

  if (roles && !roles.includes(perfil.rol)) return <Navigate to="/403" replace />
  return <Outlet />
}
