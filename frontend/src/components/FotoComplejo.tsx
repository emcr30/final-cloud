/** Fotos de cancha (en public/img) para los complejos que aún no subieron la suya. */
const FOTOS_RESPALDO = ['/img/volcan.jpg', '/img/partido.jpg', '/img/noche-sm.jpg', '/img/cesped.jpg', '/img/aerea.jpg']

/**
 * Elige siempre la misma foto para el mismo nombre (un hash simple del texto),
 * así la lista y el detalle muestran la misma. El 14 se eligió para que los
 * 5 complejos demo del seed no repitan foto.
 */
function fotoPorNombre(nombre: string) {
  const hash = [...nombre].reduce((acc, letra) => (acc * 14 + letra.charCodeAt(0)) % 100003, 0)
  return FOTOS_RESPALDO[hash % FOTOS_RESPALDO.length]
}

/**
 * Foto del complejo. Si no tiene foto (los del seed no tienen), usa una foto de
 * cancha de respaldo para que la tarjeta nunca quede vacía.
 * El <img> va dentro de un marco con overflow oculto para que el zoom al pasar
 * el mouse (clase .foto-zoom) no se salga del borde.
 */
export default function FotoComplejo({ url, nombre, className = '' }: { url: string | null; nombre: string; className?: string }) {
  return (
    <div className={`w-full overflow-hidden bg-gray-200 ${className}`}>
      <img
        src={url || fotoPorNombre(nombre)}
        alt={`Cancha de ${nombre}`}
        loading="lazy"
        className="foto-zoom h-full w-full object-cover"
      />
    </div>
  )
}
