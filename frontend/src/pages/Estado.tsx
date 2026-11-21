import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, CircleAlert, CircleX, Loader2, RefreshCw } from 'lucide-react'
import { API_URL, supabase } from '../lib/supabase'

type Nivel = 'ok' | 'lento' | 'error' | 'cargando'

interface Chequeo {
  nombre: string
  descripcion: string
  nivel: Nivel
  ms?: number
  detalle?: string
}

/** Más de esto se marca amarillo (p. ej. Render gratis "despertando"). */
const UMBRAL_LENTO_MS = 1500
const REFRESCO_MS = 30_000
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Mide cuánto tarda una promesa y la clasifica en verde / amarillo / rojo. */
async function medir(fn: () => Promise<string | undefined>): Promise<Pick<Chequeo, 'nivel' | 'ms' | 'detalle'>> {
  const inicio = performance.now()
  try {
    const detalle = await fn()
    const ms = Math.round(performance.now() - inicio)
    return { nivel: ms > UMBRAL_LENTO_MS ? 'lento' : 'ok', ms, detalle }
  } catch (e) {
    return { nivel: 'error', ms: Math.round(performance.now() - inicio), detalle: (e as Error).message }
  }
}

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const ESTILO: Record<Nivel, { clase: string; texto: string; Icono: typeof CheckCircle2 }> = {
  ok: { clase: 'bg-cesped-500', texto: 'Operativo', Icono: CheckCircle2 },
  lento: { clase: 'bg-amber-400', texto: 'Lento', Icono: CircleAlert },
  error: { clase: 'bg-red-500', texto: 'Caído', Icono: CircleX },
  cargando: { clase: 'bg-gray-300', texto: 'Comprobando…', Icono: Loader2 },
}

/**
 * /estado (pública): semáforo de los servicios de la plataforma.
 * Útil en la exposición para mostrar que todo está desplegado y conectado.
 */
export default function Estado() {
  const [chequeos, setChequeos] = useState<Chequeo[]>([])
  const [hora, setHora] = useState('')

  const comprobar = useCallback(async () => {
    const lista: { nombre: string; descripcion: string; fn: () => Promise<string | undefined> }[] = [
      {
        nombre: 'Backend (Render)',
        descripcion: 'FastAPI en Docker · GET /health',
        fn: async () => {
          const d = await getJson(`${API_URL}/health`)
          return `entorno ${d.entorno} · hora del servidor ${String(d.hora).slice(11, 16)}`
        },
      },
      {
        nombre: 'Base de datos (Supabase)',
        descripcion: 'Postgres con RLS · catálogo público',
        fn: async () => {
          const { count, error } = await supabase.from('complejos').select('id', { count: 'exact', head: true })
          if (error) throw new Error(error.message)
          return `${count ?? 0} complejos activos`
        },
      },
      {
        nombre: 'Autenticación (Supabase Auth)',
        descripcion: 'Login, registro y MFA',
        fn: async () => {
          await getJson(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY ?? '' } })
          return 'respondiendo'
        },
      },
      {
        nombre: 'Integraciones del backend',
        descripcion: 'Supabase (service role), Stripe, Resend, cron',
        fn: async () => {
          const d = await getJson(`${API_URL}/health/servicios`)
          const faltan = Object.entries(d).filter(([, v]) => !v).map(([k]) => k)
          if (!d.supabase) throw new Error('el backend no llega a Supabase')
          return faltan.length ? `sin configurar: ${faltan.join(', ')}` : 'todas configuradas'
        },
      },
    ]
    setChequeos(lista.map(({ nombre, descripcion }) => ({ nombre, descripcion, nivel: 'cargando' })))
    const resultados = await Promise.all(lista.map((c) => medir(c.fn)))
    setChequeos(lista.map(({ nombre, descripcion }, i) => ({ nombre, descripcion, ...resultados[i] })))
    setHora(new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima' }))
  }, [])

  useEffect(() => {
    // Primera comprobación en el siguiente "tick" y luego cada 30 s
    const primera = setTimeout(comprobar, 0)
    const intervalo = setInterval(comprobar, REFRESCO_MS)
    return () => { clearTimeout(primera); clearInterval(intervalo) }
  }, [comprobar])

  const peor: Nivel = chequeos.some((c) => c.nivel === 'error') ? 'error'
    : chequeos.some((c) => c.nivel === 'cargando') ? 'cargando'
    : chequeos.some((c) => c.nivel === 'lento') ? 'lento' : 'ok'
  const general = { ok: 'Todos los sistemas operativos', lento: 'Operativo con demoras', error: 'Hay servicios con problemas', cargando: 'Comprobando…' }[peor]

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-semibold text-gray-900"><Activity /> Estado de la plataforma</h1>
        <button onClick={comprobar} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50">
          <RefreshCw size={16} /> Comprobar ahora
        </button>
      </div>

      <div className={`mb-6 flex items-center gap-3 rounded-xl p-4 text-white ${ESTILO[peor].clase} ${peor === 'lento' ? 'text-gray-900' : ''}`}>
        <span className="text-lg font-bold">{general}</span>
      </div>

      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
        {chequeos.map((c) => {
          const { clase, texto, Icono } = ESTILO[c.nivel]
          return (
            <li key={c.nombre} className="flex items-center gap-4 p-4">
              {/* Semáforo: el color siempre va acompañado de ícono y texto */}
              <span className={`h-4 w-4 shrink-0 rounded-full ${clase}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{c.nombre}</p>
                <p className="text-sm text-gray-500">{c.descripcion}</p>
                {c.detalle && <p className={`text-sm ${c.nivel === 'error' ? 'text-red-600' : 'text-gray-600'}`}>{c.detalle}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 text-sm font-medium text-gray-700">
                  <Icono size={16} className={c.nivel === 'cargando' ? 'animate-spin' : ''} /> {texto}
                </p>
                {c.ms != null && <p className="text-xs text-gray-500">{c.ms} ms</p>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-gray-500">
        Se actualiza cada 30 s{hora && ` · última comprobación ${hora}`}. Amarillo = responde en más de {UMBRAL_LENTO_MS / 1000} s
        (el plan gratis de Render "duerme" y tarda en despertar). API: {API_URL}
      </p>
    </div>
  )
}
