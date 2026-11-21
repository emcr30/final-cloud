import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import iconoUrl from 'leaflet/dist/images/marker-icon.png'
import icono2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import sombraUrl from 'leaflet/dist/images/marker-shadow.png'
import { CENTRO_MAPA, soles, type Complejo } from '../lib/canchas'

// Con Vite, Leaflet no encuentra sus íconos por defecto: se los indicamos a mano.
L.Icon.Default.mergeOptions({ iconUrl: iconoUrl, iconRetinaUrl: icono2xUrl, shadowUrl: sombraUrl })

/** Mueve el mapa cuando cambia el centro (p. ej. al pulsar "Cerca de mí"). */
function Recentrar({ centro, zoom }: { centro: [number, number]; zoom: number }) {
  const mapa = useMap()
  const [lat, lng] = centro
  // Dependemos de los números (no del arreglo) para no recentrar en cada render
  useEffect(() => {
    mapa.setView([lat, lng], zoom)
  }, [mapa, lat, lng, zoom])
  return null
}

interface Props {
  complejos: (Complejo & { precioDesde?: number })[]
  centro?: [number, number]
  zoom?: number
  /** Posición del usuario (punto azul). */
  miUbicacion?: [number, number] | null
  alto?: string
  /** Mostrar el botón "Ver canchas" en el popup. */
  conEnlace?: boolean
}

/** Mapa de OpenStreetMap (sin API key) con un marcador por complejo. */
export default function MapaComplejos({
  complejos, centro = CENTRO_MAPA, zoom = 12, miUbicacion, alto = 'h-[28rem]', conEnlace = true,
}: Props) {
  return (
    <div className={`${alto} overflow-hidden rounded-xl border border-gray-200`}>
      <MapContainer center={centro} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <Recentrar centro={centro} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {miUbicacion && (
          <CircleMarker center={miUbicacion} radius={9} pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.8 }}>
            <Popup>Estás aquí</Popup>
          </CircleMarker>
        )}
        {complejos
          .filter((c) => c.lat != null && c.lng != null)
          .map((c) => (
            <Marker key={c.id} position={[c.lat!, c.lng!]}>
              <Popup>
                <p className="font-semibold">{c.nombre}</p>
                <p className="text-xs text-gray-500">{c.distrito}</p>
                {c.precioDesde != null && <p className="mt-1 text-sm">Desde <b>{soles(c.precioDesde)}</b> / hora</p>}
                {conEnlace && (
                  <Link to={`/canchas/${c.id}`} className="mt-2 inline-block rounded bg-cesped-600 px-2 py-1 text-xs font-semibold !text-white">
                    Ver canchas
                  </Link>
                )}
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  )
}
