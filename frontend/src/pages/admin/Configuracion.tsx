import { useEffect, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Alerta, Campo, Cargando, claseBoton } from '../../components/ui'

interface Config { comision_pct: number; minutos_expiracion: number; updated_at: string }

/**
 * /admin/configuracion: parámetros de la plataforma (tabla configuracion, una fila).
 * RLS: solo el admin con MFA puede leerla y actualizarla. Los límites
 * (comisión 0-50 %, expiración 5-120 min) los valida un CHECK en la base.
 */
export default function AdminConfiguracion() {
  const [config, setConfig] = useState<Config | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('configuracion').select('comision_pct, minutos_expiracion, updated_at').eq('id', 1).maybeSingle()
      .then(({ data, error }) => {
        if (error) setMensaje({ tipo: 'error', texto: error.message })
        setConfig(data as Config | null)
      })
  }, [])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setMensaje(null)
    const { data, error } = await supabase.from('configuracion')
      .update({ comision_pct: config!.comision_pct, minutos_expiracion: config!.minutos_expiracion })
      .eq('id', 1).select('comision_pct, minutos_expiracion, updated_at').single()
    if (error) {
      setMensaje({ tipo: 'error', texto: error.code === '23514' ? 'Valor fuera de rango (comisión 0-50 %, expiración 5-120 min).' : error.message })
    } else {
      setConfig(data as Config)
      setMensaje({ tipo: 'exito', texto: 'Configuración guardada.' })
    }
    setGuardando(false)
  }

  if (!config) return mensaje ? <Alerta>{mensaje.texto}</Alerta> : <Cargando />

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Configuración</h1>
      <form onSubmit={guardar} className="max-w-md space-y-4 rounded-xl border border-gray-200 p-4">
        {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
        <div>
          <Campo label="Comisión de la plataforma (%)" type="number" min={0} max={50} step="0.5" required
            value={config.comision_pct} onChange={(e) => setConfig({ ...config, comision_pct: Number(e.target.value) })} />
          <p className="mt-1 text-xs text-gray-500">Simulada: se muestra en el dashboard como ingreso de CanchaYa.</p>
        </div>
        <div>
          <Campo label="Minutos para pagar una reserva" type="number" min={5} max={120} required
            value={config.minutos_expiracion} onChange={(e) => setConfig({ ...config, minutos_expiracion: Number(e.target.value) })} />
          <p className="mt-1 text-xs text-gray-500">Pasado ese tiempo, la limpieza automática cancela la reserva pendiente y libera el horario.</p>
        </div>
        <button type="submit" disabled={guardando} className={claseBoton}>
          <Save size={18} /> {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <p className="text-xs text-gray-400">
          Última modificación: {new Date(config.updated_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
        </p>
      </form>
    </>
  )
}
