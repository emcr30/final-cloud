import { Link } from 'react-router-dom'
import { CalendarCheck, CreditCard, MapPin } from 'lucide-react'

/** Página de inicio provisional (la landing completa llega en la Parte 3). */
export default function Inicio() {
  const pasos = [
    { icono: MapPin, titulo: 'Encuentra', texto: 'Busca canchas cerca de ti en el mapa.' },
    { icono: CalendarCheck, titulo: 'Reserva', texto: 'Elige fecha y hora disponibles al instante.' },
    { icono: CreditCard, titulo: 'Paga', texto: 'Paga en línea y recibe tu confirmación por correo.' },
  ]

  return (
    <>
      <section className="bg-gradient-to-br from-cesped-700 to-cesped-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            Tu cancha de fútbol, a un clic.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-cesped-100">
            Reserva canchas de fútbol 5, 7 y 11 en los mejores complejos de Lima y paga en línea.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/canchas"
              className="rounded-lg bg-white px-5 py-3 font-semibold text-cesped-800 shadow hover:bg-cesped-50"
            >
              Buscar canchas
            </Link>
            <Link
              to="/registro"
              className="rounded-lg border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10"
            >
              Registra tu complejo
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-3">
        {pasos.map(({ icono: Icono, titulo, texto }) => (
          <div key={titulo} className="rounded-xl border border-gray-200 p-6">
            <Icono className="text-cesped-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-gray-900">{titulo}</h2>
            <p className="mt-1 text-gray-600">{texto}</p>
          </div>
        ))}
      </section>
    </>
  )
}
