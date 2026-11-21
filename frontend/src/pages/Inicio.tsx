import { Link } from 'react-router-dom'
import { BarChart3, CalendarCheck, CreditCard, MapPin, Search, ShieldCheck, Building2 } from 'lucide-react'

/** Landing pública: hero, cómo funciona y llamada a los dueños de complejos. */
export default function Inicio() {
  const pasos = [
    { icono: Search, titulo: '1. Busca', texto: 'Filtra por distrito, tipo de cancha y precio, o usa el mapa para ver las más cercanas.' },
    { icono: CalendarCheck, titulo: '2. Reserva', texto: 'Elige fecha y horario libre en tiempo real. Nadie más puede tomar tu hora.' },
    { icono: CreditCard, titulo: '3. Paga y juega', texto: 'Paga en línea con tarjeta y recibe la confirmación y un recordatorio por correo.' },
  ]
  const beneficios = [
    { icono: CalendarCheck, texto: 'Agenda semanal de todas tus canchas' },
    { icono: BarChart3, texto: 'Métricas de ocupación, ingresos y horas pico' },
    { icono: CreditCard, texto: 'Cobros en línea sin efectivo' },
    { icono: ShieldCheck, texto: 'Tus datos aislados y protegidos con MFA' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-cesped-700 to-cesped-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-cesped-100">
            <MapPin size={14} /> Complejos deportivos en todo Lima
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">Tu cancha de fútbol, a un clic.</h1>
          <p className="mt-4 max-w-xl text-lg text-cesped-100">
            Reserva canchas de fútbol 5, 7 y 11 en los mejores complejos de Lima y paga en línea.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/canchas" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-cesped-800 shadow hover:bg-cesped-50">
              <Search size={18} /> Buscar canchas
            </Link>
            <Link to="/registro?complejo=1" className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10">
              <Building2 size={18} /> Registra tu complejo
            </Link>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-gray-900">¿Cómo funciona?</h2>
        <p className="mt-2 text-center text-gray-600">Reservar te toma menos de un minuto.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {pasos.map(({ icono: Icono, titulo, texto }) => (
            <div key={titulo} className="rounded-xl border border-gray-200 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cesped-50">
                <Icono className="text-cesped-600" size={26} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{titulo}</h3>
              <p className="mt-1 text-gray-600">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Para dueños de complejos */}
      <section className="bg-gray-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">¿Tienes un complejo deportivo?</h2>
            <p className="mt-3 text-gray-600">
              Publica tus canchas en CanchaYa y recibe reservas pagadas las 24 horas. Tú administras precios y
              horarios; nosotros nos encargamos de los pagos y los recordatorios.
            </p>
            <Link to="/registro?complejo=1" className="mt-6 inline-block rounded-lg bg-cesped-600 px-5 py-3 font-semibold text-white hover:bg-cesped-700">
              Registra tu complejo
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {beneficios.map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm">
                <Icono className="mt-0.5 shrink-0 text-cesped-600" size={20} />
                <span className="text-sm text-gray-700">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
