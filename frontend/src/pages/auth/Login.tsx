import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { rutaPanel, useAuth } from '../../context/AuthContext'
import { Alerta, Campo, TarjetaAuth, claseBoton } from '../../components/ui'

export default function Login() {
  const { session, perfil } = useAuth()
  const navigate = useNavigate()
  const desde = (useLocation().state as { desde?: string } | null)?.desde

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Cuando ya hay sesión y perfil, ir al panel (RutaProtegida se encarga del paso MFA)
  useEffect(() => {
    if (session && perfil) navigate(desde ?? rutaPanel(perfil.rol), { replace: true })
  }, [session, perfil, desde, navigate])

  async function ingresar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setEnviando(false)
    if (error) setError(traducirError(error.message))
  }

  return (
    <TarjetaAuth titulo="Ingresar" subtitulo="Bienvenido de vuelta a CanchaYa">
      <form onSubmit={ingresar} className="space-y-4">
        {error && <Alerta>{error}</Alerta>}
        <Campo label="Correo" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo label="Contraseña" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="text-right">
          <Link to="/recuperar" className="text-sm text-cesped-700 hover:underline">¿Olvidaste tu contraseña?</Link>
        </div>
        <button className={claseBoton} disabled={enviando}>
          <LogIn size={18} /> {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        ¿No tienes cuenta? <Link to="/registro" className="font-semibold text-cesped-700 hover:underline">Regístrate</Link>
      </p>
    </TarjetaAuth>
  )
}
