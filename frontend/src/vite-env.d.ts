/// <reference types="vite/client" />

/** Tipos de las variables de entorno que usa el frontend. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
}
