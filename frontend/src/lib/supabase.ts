import { createClient } from '@supabase/supabase-js'

/**
 * Variables de entorno del frontend (definidas en .env, ver .env.example).
 * Vite solo expone al navegador las variables con prefijo VITE_.
 * La anon key es pública por diseño: la seguridad real la da RLS en Postgres.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** URL del backend FastAPI (Render en producción, localhost en desarrollo). */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[CanchaYa] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en frontend/.env')
}

/** Cliente único de Supabase para toda la app (auth, base de datos y storage). */
export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'falta-anon-key',
)
