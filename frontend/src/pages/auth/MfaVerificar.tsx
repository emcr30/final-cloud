import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { rutaPanel, useAuth } from '../../context/AuthContext'
import { Alerta, Campo, Cargando, TarjetaAuth, claseBoton } from '../../components/ui'

/**
 * Segundo paso del login: la contraseña dio una sesión AAL1; el código TOTP
 * la sube a AAL2. Sin este paso, admin y propietario no entran a su panel.
 */
export default function MfaVerificar() {
  const { session, perfil, mfa, cargando, refrescar, cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const desde = (useLocation().state as { desde?: string } | null)?.desde

  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function verificar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { data: factores } = await supabase.auth.mfa.listFactors()
    const factor = factores?.totp[0]
    if (!factor) {
      setEnviando(false)
      return setError('No tienes un factor MFA configurado.')
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.trim() })
    if (error) {
      setEnviando(false)
      setCodigo('')
      return setError(traducirError(error.message))
    }
    await refrescar()
    navigate(desde ?? rutaPanel(perfil?.rol), { replace: true })
  }

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/login" replace />
  if (mfa.nivelActual === 'aal2') return <Navigate to={rutaPanel(perfil?.rol)} replace />

  return (
    <TarjetaAuth titulo="Verificación en dos pasos" subtitulo="Abre tu app autenticadora e ingresa el código de CanchaYa.">
      <form onSubmit={verificar} className="space-y-4">
        {error && <Alerta>{error}</Alerta>}
        <Campo
          label="Código de 6 dígitos"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        />
        <button className={claseBoton} disabled={enviando}>
          <ShieldCheck size={18} /> {enviando ? 'Verificando…' : 'Verificar'}
        </button>
      </form>
      <button onClick={cerrarSesion} className="mt-4 w-full text-center text-sm text-gray-500 hover:underline">
        Usar otra cuenta
      </button>
    </TarjetaAuth>
  )
}
