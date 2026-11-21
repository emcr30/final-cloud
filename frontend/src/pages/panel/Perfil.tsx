import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Save, ShieldCheck, ShieldOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { ROLES_CON_MFA, useAuth } from '../../context/AuthContext'
import { Alerta, Campo } from '../../components/ui'

/** /perfil: editar datos, gestionar MFA y cerrar sesión. Disponible para todos los roles. */
export default function Perfil() {
  const { session, perfil, mfa, refrescar, cerrarSesion } = useAuth()
  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '')
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null)

  if (!perfil) return null
  const mfaObligatorio = ROLES_CON_MFA.includes(perfil.rol)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    // RLS + privilegios por columna: solo puede editar nombre y teléfono de SU perfil
    const { error } = await supabase.from('profiles').update({ nombre, telefono }).eq('id', perfil!.id)
    if (error) return setMensaje({ tipo: 'error', texto: traducirError(error.message) })
    await refrescar()
    setMensaje({ tipo: 'exito', texto: 'Datos actualizados.' })
  }

  async function desactivarMfa() {
    if (!confirm('¿Desactivar la verificación en dos pasos?')) return
    const { data } = await supabase.auth.mfa.listFactors()
    for (const f of data?.all ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
      if (error) return setMensaje({ tipo: 'error', texto: traducirError(error.message) })
    }
    await supabase.auth.refreshSession() // el token vuelve a AAL1
    await refrescar()
    setMensaje({ tipo: 'exito', texto: 'MFA desactivado.' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
      {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}

      <form onSubmit={guardar} className="space-y-4 rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">Datos personales</h2>
        <Campo label="Correo" value={session?.user.email ?? ''} disabled />
        <Campo label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo label="Teléfono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <button className="inline-flex items-center gap-2 rounded-lg bg-cesped-600 px-4 py-2 font-semibold text-white hover:bg-cesped-700">
          <Save size={16} /> Guardar
        </button>
      </form>

      <div className="rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900">Verificación en dos pasos (MFA)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Estado:{' '}
          {mfa.tieneFactor ? (
            <span className="font-semibold text-cesped-700">activado</span>
          ) : (
            <span className="font-semibold text-gray-700">desactivado</span>
          )}{' '}
          · Sesión actual: <code>{mfa.nivelActual}</code>
          {mfaObligatorio && ' · Obligatorio para tu rol'}
        </p>
        <div className="mt-4">
          {!mfa.tieneFactor && (
            <Link to="/mfa/configurar" className="inline-flex items-center gap-2 rounded-lg bg-cesped-600 px-4 py-2 font-semibold text-white hover:bg-cesped-700">
              <ShieldCheck size={16} /> Activar MFA
            </Link>
          )}
          {mfa.tieneFactor && !mfaObligatorio && (
            <button onClick={desactivarMfa} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50">
              <ShieldOff size={16} /> Desactivar MFA
            </button>
          )}
        </div>
      </div>

      <button onClick={cerrarSesion} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50">
        <LogOut size={16} /> Cerrar sesión
      </button>
    </div>
  )
}
