import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Alerta, Campo, TarjetaAuth, claseBoton } from '../../components/ui'

/**
 * Destino del enlace de recuperación. supabase-js lee el token del enlace y crea
 * una sesión temporal; con ella el usuario puede fijar una nueva contraseña.
 */
export default function NuevaPassword() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setEnviando(false)
    if (error) return setError(traducirError(error.message))
    navigate('/login', { replace: true })
  }

  if (!session) {
    return (
      <TarjetaAuth titulo="Enlace no válido">
        <Alerta>El enlace expiró o ya fue usado. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”.</Alerta>
      </TarjetaAuth>
    )
  }

  return (
    <TarjetaAuth titulo="Nueva contraseña">
      <form onSubmit={guardar} className="space-y-4">
        {error && <Alerta>{error}</Alerta>}
        <Campo label="Nueva contraseña" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <button className={claseBoton} disabled={enviando}>
          <KeyRound size={18} /> Guardar contraseña
        </button>
      </form>
    </TarjetaAuth>
  )
}
