import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { traducirError } from '../../lib/api'
import { Alerta, Campo, TarjetaAuth, claseBoton } from '../../components/ui'

/** Envía un correo con un enlace para crear una nueva contraseña (/nueva-password). */
export default function Recuperar() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-password`,
    })
    setEnviando(false)
    if (error) setError(traducirError(error.message))
    else setEnviado(true)
  }

  return (
    <TarjetaAuth titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace a tu correo">
      {enviado ? (
        <Alerta tipo="exito">Si existe una cuenta con <b>{email}</b>, recibirás un enlace en unos minutos.</Alerta>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {error && <Alerta>{error}</Alerta>}
          <Campo label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className={claseBoton} disabled={enviando}>
            <Mail size={18} /> {enviando ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-cesped-700 hover:underline">Volver a ingresar</Link>
      </p>
    </TarjetaAuth>
  )
}
