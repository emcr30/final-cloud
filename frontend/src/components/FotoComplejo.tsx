/**
 * Foto del complejo. Si no tiene foto (los del seed no tienen), muestra un
 * "césped" con franjas y la inicial del nombre, para que la tarjeta no quede vacía.
 */
export default function FotoComplejo({ url, nombre, className = '' }: { url: string | null; nombre: string; className?: string }) {
  if (url) return <img src={url} alt={nombre} className={`w-full object-cover ${className}`} />
  return (
    <div
      className={`flex w-full items-center justify-center text-4xl font-black text-white/90 ${className}`}
      style={{ background: 'repeating-linear-gradient(90deg, #16a34a 0 28px, #15803d 28px 56px)' }}
      aria-label={nombre}
    >
      {nombre.charAt(0)}
    </div>
  )
}
