/* eslint-disable react-refresh/only-export-components */
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/** Clases reutilizables para mantener el mismo estilo en todos los formularios. */
export const claseInput =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-cesped-600 focus:ring-2 focus:ring-cesped-100'
export const claseBoton =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cesped-600 px-4 py-2.5 font-semibold text-white hover:bg-cesped-700 disabled:cursor-not-allowed disabled:opacity-60'

/** Campo de formulario con etiqueta. */
export function Campo({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input className={claseInput} {...props} />
    </label>
  )
}

/** Tarjeta centrada para pantallas de autenticación (login, registro, MFA...). */
export function TarjetaAuth({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-gray-600">{subtitulo}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/** Mensaje de error o éxito. */
export function Alerta({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const estilos = {
    error: 'border-red-200 bg-red-50 text-red-700',
    exito: 'border-cesped-200 bg-cesped-50 text-cesped-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }
  return <div className={`rounded-lg border px-3 py-2 text-sm ${estilos[tipo]}`}>{children}</div>
}

/** Indicador de carga a pantalla completa. */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
      <Loader2 className="animate-spin" size={20} /> {texto}
    </div>
  )
}
