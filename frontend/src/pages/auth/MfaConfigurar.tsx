import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { ROLES_CON_MFA, rutaPanel, useAuth } from '../../context/AuthContext'
import { Alerta, Campo, Cargando, TarjetaAuth, claseBoton } from '../../components/ui'

/**
 * Alta de MFA con TOTP (Google Authenticator, Authy, Microsoft Authenticator…):
 *  1. enroll()   → Supabase crea un factor "sin verificar" y devuelve un QR + secreto.
 *  2. El usuario escanea el QR y escribe el código de 6 dígitos.
 *  3. challengeAndVerify() → el factor queda verificado y la sesión sube a AAL2.
 */
export default function MfaConfigurar() {
  const { session, perfil, mfa, cargando, refrescar } = useAuth()
  const navigate = useNavigate()
  const desde = (useLocation().state as { desde?: string } | null)?.desde

  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secreto, setSecreto] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const iniciado = useRef(false) // evita doble enroll en modo estricto de React

  const obligatorio = perfil ? ROLES_CON_MFA.includes(perfil.rol) : false

  useEffect(() => {
    if (cargando || !session || mfa.tieneFactor || iniciado.current) return
    iniciado.current = true
    ;(async () => {
      // Limpia intentos anteriores que quedaron sin verificar (si no, enroll falla)
      const { data: factores } = await supabase.auth.mfa.listFactors()
      for (const f of factores?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `CanchaYa ${new Date().toISOString()}`,
      })
      if (error) return setError(traducirError(error.message))
      setFactorId(data.id)
      setQr(data.totp.qr_code) // imagen SVG como data URL
      setSecreto(data.totp.secret)
    })()
  }, [cargando, session, mfa.tieneFactor])

  async function verificar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() })
    if (error) {
      setEnviando(false)
      return setError(traducirError(error.message))
    }
    await refrescar() // ahora la sesión es AAL2 y tieneFactor = true
    navigate(desde ?? rutaPanel(perfil?.rol), { replace: true })
  }

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/login" replace />
  if (mfa.tieneFactor) {
    return (
      <TarjetaAuth titulo="MFA ya activado">
        <Alerta tipo="exito">Tu cuenta ya está protegida con verificación en dos pasos.</Alerta>
        <Link to="/perfil" className={`${claseBoton} mt-6`}>Ir a mi perfil</Link>
      </TarjetaAuth>
    )
  }

  return (
    <TarjetaAuth
      titulo="Activa la verificación en dos pasos"
      subtitulo={
        obligatorio
          ? 'Tu rol requiere MFA para proteger los datos de la plataforma.'
          : 'Añade una capa extra de seguridad a tu cuenta.'
      }
    >
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-gray-700">
        <li>Instala Google Authenticator, Authy o Microsoft Authenticator.</li>
        <li>Escanea el código QR (o escribe el código secreto).</li>
        <li>Ingresa el código de 6 dígitos que muestra la app.</li>
      </ol>

      {qr ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4">
          <img src={qr} alt="Código QR para la app autenticadora" className="h-44 w-44" />
          <p className="text-xs text-gray-500">Código secreto</p>
          <code className="break-all rounded bg-gray-100 px-2 py-1 text-center text-xs">{secreto}</code>
        </div>
      ) : (
        !error && <Cargando texto="Generando código QR…" />
      )}

      <form onSubmit={verificar} className="mt-4 space-y-4">
        {error && <Alerta>{error}</Alerta>}
        <Campo
          label="Código de 6 dígitos"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        />
        <button className={claseBoton} disabled={enviando || !factorId}>
          <ShieldCheck size={18} /> {enviando ? 'Verificando…' : 'Activar MFA'}
        </button>
      </form>

      {!obligatorio && (
        <p className="mt-4 text-center text-sm">
          <Link to="/perfil" className="text-gray-500 hover:underline">Ahora no</Link>
        </p>
      )}
    </TarjetaAuth>
  )
}
