import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, Search } from 'lucide-react'

/** Los tres pasos de una reserva (se numeran con tipografía mono). */
const PASOS = [
  { titulo: 'Busca por distrito o en el mapa', texto: 'Filtra por tipo de cancha y precio por hora, o activa "Cerca de mí" para ordenar por distancia.' },
  { titulo: 'Elige día y horas libres', texto: 'Ves los horarios de cada cancha en tiempo real. Las horas tomadas aparecen tachadas.' },
  { titulo: 'Paga con tarjeta y listo', texto: 'Recibes la confirmación al correo y un recordatorio el día anterior al partido.' },
]

/** Lo que gana un complejo al publicar sus canchas. */
const PARA_DUENOS = [
  { etiqueta: 'Agenda', texto: 'Todas tus canchas en una semana, con quién reservó cada hora.' },
  { etiqueta: 'Cobros', texto: 'El jugador paga al reservar. Nada de efectivo ni separaciones sin pago.' },
  { etiqueta: 'Métricas', texto: 'Ocupación por cancha, ingresos por día y tus horas pico.' },
  { etiqueta: 'Seguridad', texto: 'Tus datos aislados de otros complejos y acceso con verificación en dos pasos.' },
]

/** Landing pública: portada con foto, cómo reservar, frase grande, dueños y cierre. */
export default function Inicio() {
  return (
    <>
      {/* ───────── Portada: foto nocturna a pantalla completa ───────── */}
      <section className="relative -mt-16 flex min-h-[100svh] items-end overflow-hidden bg-gray-950 text-white">
        <img
          src="/img/noche.jpg"
          alt="Partido nocturno de fútbol 7 en una cancha sintética iluminada"
          className="absolute inset-0 h-full w-full object-cover object-[60%_center]"
          fetchPriority="high"
        />
        {/* Degradado para que el texto se lea sobre la foto */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/55 to-gray-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/70 via-transparent to-transparent" />

        <div className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-32 sm:px-6 sm:pb-14">
          <p className="animate-entrar font-mono text-xs uppercase tracking-[0.18em] text-cesped-200">
            Arequipa · Fútbol 5, 7 y 11
          </p>
          <h1 className="mt-4 max-w-3xl animate-entrar text-[2.6rem] font-semibold leading-[1.02] [animation-delay:80ms] sm:text-6xl lg:text-7xl">
            Reserva tu cancha de fútbol en Arequipa sin llamar a nadie.
          </h1>
          <p className="mt-5 max-w-xl animate-entrar text-lg text-white/80 [animation-delay:160ms]">
            Mira los horarios libres de cada complejo, aparta tus horas y paga con tarjeta. Llegas y juegas.
          </p>
          <div className="mt-8 flex animate-entrar flex-col gap-3 [&_a:focus-visible]:outline-cesped-200 [animation-delay:240ms] sm:flex-row">
            <Link to="/canchas" className="boton inline-flex items-center justify-center gap-2 rounded-full bg-cesped-200 px-6 py-3.5 font-semibold text-gray-900 hover:bg-white">
              <Search size={18} /> Buscar canchas
            </Link>
            <Link to="/registro?complejo=1" className="boton inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-6 py-3.5 font-semibold text-white hover:border-white hover:bg-white/10">
              <Building2 size={18} /> Registrar mi complejo
            </Link>
          </div>

          {/* Tres datos concretos al pie de la portada */}
          <dl className="mt-12 grid animate-entrar grid-cols-1 gap-4 border-t border-white/15 pt-6 [animation-delay:320ms] sm:grid-cols-3">
            {[
              ['Horarios', 'En tiempo real'],
              ['Pago', 'Tarjeta, en línea'],
              ['Recordatorio', 'Por correo, un día antes'],
            ].map(([dt, dd]) => (
              <div key={dt} className="flex items-baseline justify-between gap-3 sm:block">
                <dt className="font-mono text-xs uppercase tracking-[0.14em] text-white/55">{dt}</dt>
                <dd className="text-base font-medium text-white sm:mt-1">{dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────── Cómo reservar: foto + pasos ───────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="order-2 overflow-hidden rounded-2xl lg:order-1">
            <img src="/img/partido.jpg" alt="Jugadores en una cancha de fútbol 5 techada con malla" className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </div>
          <div className="order-1 lg:order-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-cesped-600">Cómo reservar</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight text-gray-900 sm:text-5xl">Tres pasos y tu hora queda apartada.</h2>
            <ol className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
              {PASOS.map((p, i) => (
                <li key={p.titulo} className="grid grid-cols-[3rem_1fr] gap-2 py-6">
                  <span className="font-mono text-sm text-gray-500">0{i + 1}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{p.titulo}</h3>
                    <p className="mt-1.5 text-gray-700">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link to="/canchas" className="mt-8 inline-flex items-center gap-2 font-semibold text-gray-900">
              <span className="subrayado">Ver canchas disponibles</span> <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Frase grande sobre fondo oscuro + dos fotos ───────── */}
      <section className="bg-gray-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 className="max-w-4xl text-4xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
            Nadie más puede tomar tu hora <span className="text-cesped-200">una vez que la reservas.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            El sistema bloquea el horario al instante. Si no pagas en 15 minutos, se libera para el siguiente equipo.
          </p>
          <div className="mt-14 grid gap-4 sm:grid-cols-[1.6fr_1fr]">
            <div className="overflow-hidden rounded-2xl">
              <img src="/img/volcan.jpg" alt="Cancha sintética al sol con el volcán Misti al fondo" className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-[26rem]" loading="lazy" />
            </div>
            <div className="overflow-hidden rounded-2xl">
              <img src="/img/cesped.jpg" alt="Césped sintético recién marcado con líneas blancas" className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-[26rem]" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Para dueños de complejos ───────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-cesped-600">Para complejos deportivos</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight text-gray-900 sm:text-5xl">Publica tus canchas y cobra cada reserva por adelantado.</h2>
            <p className="mt-5 text-lg text-gray-600">
              Tú pones precios y horarios. CanchaYa recibe el pago, envía la confirmación y el recordatorio al jugador.
            </p>
            <dl className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
              {PARA_DUENOS.map((b) => (
                <div key={b.etiqueta} className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-gray-500 sm:pt-1">{b.etiqueta}</dt>
                  <dd className="text-gray-800">{b.texto}</dd>
                </div>
              ))}
            </dl>
            <Link to="/registro?complejo=1" className="boton mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3.5 font-semibold text-white hover:bg-cesped-600 sm:w-auto">
              Registrar mi complejo <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl">
            <img src="/img/aerea.jpg" alt="Vista aérea de un complejo deportivo con cancha de fútbol y pista atlética" className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </div>
        </div>
      </section>

      {/* ───────── Cierre ───────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="flex flex-col items-start gap-8 rounded-3xl bg-cesped-200 px-6 py-14 sm:px-12 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-2xl text-4xl font-semibold leading-[1.05] text-gray-900 sm:text-5xl">¿Juegas esta semana? Mira qué canchas quedan libres.</h2>
          <Link to="/canchas" className="boton inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3.5 font-semibold text-white hover:bg-cesped-700 focus-visible:outline-gray-900 md:w-auto">
            <Search size={18} /> Buscar canchas
          </Link>
        </div>
      </section>
    </>
  )
}
