import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, LocateFixed, Map as IconoMapa, MapPin, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Alerta, Cargando } from '../../components/ui'
import MapaComplejos from '../../components/MapaComplejos'
import FotoComplejo from '../../components/FotoComplejo'
import { CENTRO_LIMA, NOMBRE_TIPO, distanciaKm, soles, type Complejo, type TipoCancha } from '../../lib/canchas'

/**
 * /canchas (pública): lista + mapa de complejos activos.
 * RLS ya filtra: un visitante anónimo solo recibe complejos y canchas activos.
 */
export default function Buscar() {
  const [complejos, setComplejos] = useState<Complejo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const [distrito, setDistrito] = useState('')
  const [tipo, setTipo] = useState<TipoCancha | ''>('')
  const [precioMax, setPrecioMax] = useState('')
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')

  // "Cerca de mí"
  const [miUbicacion, setMiUbicacion] = useState<[number, number] | null>(null)
  const [ubicando, setUbicando] = useState(false)

  useEffect(() => {
    supabase
      .from('complejos')
      .select('id, nombre, descripcion, direccion, distrito, lat, lng, foto_url, hora_apertura, hora_cierre, canchas(id, complejo_id, nombre, tipo, superficie, precio_hora, activa)')
      .eq('estado', 'activo')
      .order('nombre')
      .then(({ data, error }) => {
        if (error) setError('No se pudieron cargar los complejos: ' + error.message)
        // Solo canchas activas (los dueños verían también las inactivas por RLS)
        setComplejos(((data ?? []) as Complejo[]).map((c) => ({ ...c, canchas: c.canchas.filter((k) => k.activa) })))
        setCargando(false)
      })
  }, [])

  const distritos = useMemo(() => [...new Set(complejos.map((c) => c.distrito))].sort(), [complejos])

  /** Aplica filtros, calcula "precio desde" y la distancia, y ordena. */
  const resultados = useMemo(() => {
    const max = Number(precioMax) || Infinity
    return complejos
      .filter((c) => !distrito || c.distrito === distrito)
      .map((c) => {
        // Canchas que cumplen tipo y precio; el complejo se muestra si tiene al menos una
        const canchas = c.canchas.filter((k) => (!tipo || k.tipo === tipo) && k.precio_hora <= max)
        const precioDesde = canchas.length ? Math.min(...canchas.map((k) => k.precio_hora)) : undefined
        const distancia = miUbicacion && c.lat != null && c.lng != null
          ? distanciaKm(miUbicacion[0], miUbicacion[1], c.lat, c.lng)
          : undefined
        return { ...c, canchasFiltradas: canchas, precioDesde, distancia }
      })
      .filter((c) => c.canchasFiltradas.length > 0)
      .sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0))
  }, [complejos, distrito, tipo, precioMax, miUbicacion])

  /** Pide la ubicación al navegador (Geolocation API). */
  function cercaDeMi() {
    if (!navigator.geolocation) {
      setError('Tu navegador no permite obtener la ubicación.')
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMiUbicacion([pos.coords.latitude, pos.coords.longitude])
        setUbicando(false)
        setError('')
      },
      () => {
        setError('No pudimos obtener tu ubicación. Revisa los permisos del navegador.')
        setUbicando(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const claseSelect = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-cesped-600'
  const claseToggle = (activo: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${activo ? 'bg-cesped-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">Buscar canchas</h1>
      <p className="mt-1 text-gray-600">Encuentra un complejo, elige tu horario y reserva en línea.</p>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Distrito
          <select className={claseSelect} value={distrito} onChange={(e) => setDistrito(e.target.value)}>
            <option value="">Todos</option>
            {distritos.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Tipo de cancha
          <select className={claseSelect} value={tipo} onChange={(e) => setTipo(e.target.value as TipoCancha | '')}>
            <option value="">Todos</option>
            {Object.entries(NOMBRE_TIPO).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Precio máx. por hora (S/)
          <input type="number" min={0} step={10} placeholder="Sin límite" className={`${claseSelect} w-36`} value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />
        </label>
        <button onClick={cercaDeMi} disabled={ubicando} className="inline-flex items-center gap-1.5 rounded-lg border border-cesped-600 bg-white px-3 py-2 text-sm font-semibold text-cesped-700 hover:bg-cesped-50 disabled:opacity-60">
          <LocateFixed size={16} /> {ubicando ? 'Ubicando…' : miUbicacion ? 'Ordenado por cercanía' : 'Cerca de mí'}
        </button>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-gray-300">
          <button className={claseToggle(vista === 'lista')} onClick={() => setVista('lista')}><List size={16} /> Lista</button>
          <button className={claseToggle(vista === 'mapa')} onClick={() => setVista('mapa')}><IconoMapa size={16} /> Mapa</button>
        </div>
      </div>

      {error && <div className="mt-4"><Alerta>{error}</Alerta></div>}

      <div className="mt-6">
        {cargando ? (
          <Cargando texto="Buscando complejos…" />
        ) : resultados.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
            <Search className="mx-auto mb-2" />
            No hay canchas con esos filtros. Prueba con otro distrito o un precio mayor.
          </div>
        ) : vista === 'mapa' ? (
          <MapaComplejos
            complejos={resultados}
            miUbicacion={miUbicacion}
            centro={miUbicacion ?? CENTRO_LIMA}
            zoom={miUbicacion ? 13 : 11}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {resultados.map((c) => (
              <Link key={c.id} to={`/canchas/${c.id}`} className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
                <FotoComplejo url={c.foto_url} nombre={c.nombre} className="h-36" />
                <div className="p-4">
                  <h2 className="font-semibold text-gray-900 group-hover:text-cesped-700">{c.nombre}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                    <MapPin size={14} /> {c.distrito}
                    {c.distancia != null && <span className="ml-1 font-medium text-blue-600">· {c.distancia.toFixed(1)} km</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {[...new Set(c.canchasFiltradas.map((k) => k.tipo))].map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{NOMBRE_TIPO[t]}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    Desde <span className="text-lg font-bold text-gray-900">{soles(c.precioDesde!)}</span> / hora
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
