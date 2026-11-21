import { useEffect, useState } from 'react'
import { Ban, RotateCcw, Search, ShieldCheck, ShieldOff } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth, type Rol } from '../../context/AuthContext'
import { Alerta, Cargando, claseInput } from '../../components/ui'

interface UsuarioAdmin {
  id: string
  email: string
  nombre: string
  telefono: string | null
  rol: Rol
  created_at: string
  last_sign_in_at: string | null
  mfa: boolean
  suspendido: boolean
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' }) : '—'

/**
 * /admin/usuarios: buscar, filtrar por rol, cambiar rol, suspender/reactivar.
 * Todo pasa por el backend (service role): el navegador no puede cambiar roles
 * ni suspender cuentas de Supabase Auth.
 */
export default function AdminUsuarios() {
  const { perfil } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null)
  const [q, setQ] = useState('')
  const [rol, setRol] = useState('')
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  // Busca 300 ms después de dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q, rol })
      api<UsuarioAdmin[]>(`/admin/usuarios?${params}`)
        .then(setUsuarios)
        .catch((e) => setMensaje({ tipo: 'error', texto: (e as Error).message }))
    }, 300)
    return () => clearTimeout(t)
  }, [q, rol, recarga])

  async function accion(u: UsuarioAdmin, fn: () => Promise<unknown>, exito: string) {
    setOcupado(u.id)
    setMensaje(null)
    try {
      await fn()
      setMensaje({ tipo: 'exito', texto: exito })
      setRecarga((n) => n + 1)
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setOcupado(null)
    }
  }

  const cambiarRol = (u: UsuarioAdmin, nuevo: Rol) =>
    accion(u, () => api(`/admin/usuarios/${u.id}/rol`, { method: 'PATCH', body: JSON.stringify({ rol: nuevo }) }),
      `${u.email} ahora es ${nuevo}.${nuevo !== 'jugador' && !u.mfa ? ' Deberá configurar MFA al entrar.' : ''}`)

  const suspender = (u: UsuarioAdmin) => {
    if (!u.suspendido && !confirm(`¿Suspender a ${u.email}? No podrá iniciar sesión.`)) return
    accion(u, () => api(`/admin/usuarios/${u.id}/suspension`, { method: 'POST', body: JSON.stringify({ suspender: !u.suspendido }) }),
      u.suspendido ? `${u.email} reactivado.` : `${u.email} suspendido.`)
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Usuarios</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-56 flex-1">
          <Search size={16} className="absolute top-3 left-3 text-gray-400" />
          <input className={`${claseInput} pl-9`} placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className={`${claseInput} w-auto`} value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          <option value="jugador">Jugadores</option>
          <option value="propietario">Propietarios</option>
          <option value="admin">Administradores</option>
        </select>
      </div>
      {mensaje && <div className="mb-3"><Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta></div>}

      {!usuarios ? <Cargando /> : usuarios.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">No hay usuarios que coincidan.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
              <tr>
                <th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">MFA</th>
                <th className="p-3">Registro</th><th className="p-3">Último ingreso</th><th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => {
                const yo = u.id === perfil?.id
                return (
                  <tr key={u.id} className={u.suspendido ? 'bg-red-50/50' : ''}>
                    <td className="p-3">
                      <p className="font-medium text-gray-900">{u.nombre} {yo && <span className="text-xs text-gray-500">(tú)</span>}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </td>
                    <td className="p-3">
                      <select className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={u.rol} disabled={yo || ocupado === u.id}
                        onChange={(e) => cambiarRol(u, e.target.value as Rol)} aria-label={`Rol de ${u.email}`}>
                        <option value="jugador">jugador</option>
                        <option value="propietario">propietario</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="p-3">
                      {u.mfa
                        ? <span className="inline-flex items-center gap-1 text-cesped-700"><ShieldCheck size={16} /> Activo</span>
                        : <span className="inline-flex items-center gap-1 text-gray-500"><ShieldOff size={16} /> No</span>}
                    </td>
                    <td className="p-3 text-gray-600">{fecha(u.created_at)}</td>
                    <td className="p-3 text-gray-600">{fecha(u.last_sign_in_at)}</td>
                    <td className="p-3">
                      {!yo && (
                        <button onClick={() => suspender(u)} disabled={ocupado === u.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-60 ${u.suspendido ? 'border-cesped-300 text-cesped-700 hover:bg-cesped-50' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
                          {u.suspendido ? <><RotateCcw size={14} /> Reactivar</> : <><Ban size={14} /> Suspender</>}
                        </button>
                      )}
                      {u.suspendido && <p className="mt-1 text-xs font-semibold text-red-600">Suspendido</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Suspender usa el "ban" de Supabase Auth: el usuario no puede iniciar sesión ni renovar su token.
        Los cambios de rol se aplican en su siguiente acción (el rol se lee de la base en cada petición).
      </p>
    </>
  )
}
