/* eslint-disable react-refresh/only-export-components */
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/** Clases reutilizables para mantener el mismo estilo en todos los formularios. */
export const claseInput =
  'w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-base text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-400 focus:border-gray-900 focus:ring-4 focus:ring-cesped-200/60'
export const claseBoton =
  'inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-cesped-600 disabled:cursor-not-allowed disabled:opacity-50'

/** Campo de formulario con etiqueta. */
export function Campo({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-800">{label}</span>
      <input className={claseInput} {...props} />
    </label>
  )
}

/**
 * Pantalla de autenticación (login, registro, MFA...): formulario a la izquierda
 * y, en pantallas grandes, una foto de cancha a la derecha.
 */
export function TarjetaAuth({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-[1fr_1.05fr]">
      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm animate-entrar">
          <h1 className="text-3xl font-semibold text-gray-900">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-gray-600">{subtitulo}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gray-900 lg:block">
        <img src="/img/volcan.jpg" alt="Cancha sintética con el volcán Misti al fondo" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/10 to-transparent" />
        <p className="absolute inset-x-10 bottom-10 max-w-md text-3xl font-semibold leading-tight text-white">
          Tu hora apartada, pagada y con recordatorio al correo.
        </p>
      </div>
    </div>
  )
}

/** Mensaje de error, éxito, información o aviso (amarillo). */
export function Alerta({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'info' | 'aviso'; children: ReactNode }) {
  const estilos = {
    error: 'border-red-200 bg-red-50 text-red-800',
    exito: 'border-cesped-300 bg-cesped-50 text-cesped-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    aviso: 'border-amber-300 bg-amber-50 text-amber-900',
  }
  return <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${estilos[tipo]}`}>{children}</div>
}

/** Indicador de carga a pantalla completa. */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
      <Loader2 className="animate-spin text-cesped-500" size={20} /> {texto}
    </div>
  )
}
