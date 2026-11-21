import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { CENTRO_MAPA } from '../lib/canchas'
import './MapaComplejos' // configura los íconos de Leaflet para Vite

/** Escucha los clics en el mapa y devuelve la coordenada. */
function Clic({ onElegir }: { onElegir: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      // 6 decimales ≈ 10 cm de precisión: más que suficiente
      onElegir(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)))
    },
  })
  return null
}

/** Mapa para elegir la ubicación del complejo con un clic. */
export default function SelectorUbicacion({
  lat, lng, onElegir,
}: { lat: number | null; lng: number | null; onElegir: (lat: number, lng: number) => void }) {
  const punto: [number, number] | null = lat != null && lng != null ? [lat, lng] : null
  return (
    <div>
      <div className="h-72 overflow-hidden rounded-xl border border-gray-300">
        <MapContainer center={punto ?? CENTRO_MAPA} zoom={punto ? 15 : 12} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Clic onElegir={onElegir} />
          {punto && <Marker position={punto} />}
        </MapContainer>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {punto ? `Ubicación: ${punto[0]}, ${punto[1]} (haz clic para cambiarla)` : 'Haz clic en el mapa para marcar dónde está tu complejo.'}
      </p>
    </div>
  )
}
