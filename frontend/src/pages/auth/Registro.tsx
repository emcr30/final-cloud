import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { rutaPanel, useAuth } from '../../context/AuthContext'
import { Alerta, Campo, TarjetaAuth, claseBoton } from '../../components/ui'

/**
 * Registro público. SIEMPRE crea un 'jugador': el trigger de la base de datos
 * ignora cualquier rol que mande el navegador. Nombre y teléfono viajan como
 * user_metadata y el trigger los copia a `profiles`.
 */
export default function Registro() {
  const { session, perfil } = useAuth()
  const navigate = useNavigate()
  const quiereComplejo = useSearchParams()[0].get('complejo') === '1'

  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', password: '', confirmar: '' })
  const [error, setError] = useState('')
  const [revisarCorreo, setRevisarCorreo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!session || !perfil) return
    // Si vino desde "Registra tu complejo" y es jugador, lo llevamos directo a la solicitud
    const destino = quiereComplejo && perfil.rol === 'jugador' ? '/jugador/solicitar-complejo' : rutaPanel(perfil.rol)
    navigate(destino, { replace: true })
  }, [session, perfil, navigate, quiereComplejo])

  const cambiar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [campo]: e.target.value })

  async function registrar(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (form.password !== form.confirmar) return setError('Las contraseñas no coinciden.')

    setEnviando(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { nombre: form.nombre.trim(), telefono: form.telefono.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    setEnviando(false)
    if (error) return setError(traducirError(error.message))
    // Si "Confirm email" está activo en Supabase no hay sesión hasta confirmar el correo
    if (!data.session) setRevisarCorreo(true)
  }

  if (revisarCorreo) {
    return (
      <TarjetaAuth titulo="Revisa tu correo">
        <Alerta tipo="exito">
          Te enviamos un enlace a <b>{form.email}</b> para confirmar tu cuenta. Luego podrás ingresar.
        </Alerta>
        <Link to="/login" className={`${claseBoton} mt-6`}>Ir a ingresar</Link>
      </TarjetaAuth>
    )
  }

  return (
    <TarjetaAuth titulo="Crear cuenta" subtitulo="Reserva canchas en minutos">
      {quiereComplejo && (
        <div className="mb-4">
          <Alerta tipo="info">
            ¿Tienes un complejo deportivo? Crea tu cuenta y luego registra tu complejo desde tu panel.
            Un administrador lo revisará y activará tu cuenta de propietario.
          </Alerta>
        </div>
      )}
      <form onSubmit={registrar} className="space-y-4">
        {error && <Alerta>{error}</Alerta>}
        <Campo label="Nombre completo" required value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" />
        <Campo label="Teléfono" type="tel" placeholder="999 999 999" value={form.telefono} onChange={cambiar('telefono')} autoComplete="tel" />
        <Campo label="Correo" type="email" required value={form.email} onChange={cambiar('email')} autoComplete="email" />
        <Campo label="Contraseña" type="password" required value={form.password} onChange={cambiar('password')} autoComplete="new-password" />
        <Campo label="Confirmar contraseña" type="password" required value={form.confirmar} onChange={cambiar('confirmar')} autoComplete="new-password" />
        <button className={claseBoton} disabled={enviando}>
          <UserPlus size={18} /> {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        ¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-cesped-700 hover:underline">Ingresa</Link>
      </p>
    </TarjetaAuth>
  )
}
