/**
 * Edge Function: send-reminders (Deno + TypeScript)
 *
 * Envía un correo de recordatorio a cada jugador con una reserva PAGADA para
 * MAÑANA (hora de Lima) que todavía no recibió recordatorio.
 *
 *  - La llama pg_cron todos los días a las 18:00 de Lima (23:00 UTC) y el
 *    botón "Ejecutar recordatorios ahora" del panel admin (vía backend).
 *  - ?dry_run=true → solo muestra qué enviaría, sin enviar ni marcar nada.
 *  - Protegida con un secreto compartido: Authorization: Bearer <CRON_SECRET>.
 *
 * Secrets (supabase secrets set): RESEND_API_KEY, EMAIL_FROM, CRON_SECRET.
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const ZONA = 'America/Lima'
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface Reserva {
  id: string
  jugador_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  cancha: { nombre: string; complejo: { nombre: string; direccion: string; distrito: string; lat: number | null; lng: number | null } | null } | null
}

/** Respuesta JSON con CORS abierto (la llama el servidor, pero así también se puede probar desde el navegador). */
function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  })
}

/** Comparación en tiempo constante (evita adivinar el secreto midiendo tiempos). */
function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferencia === 0
}

/** Fecha de mañana en Lima como 'YYYY-MM-DD'. */
function mananaLima() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function fechaLarga(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

/** Escapa texto antes de meterlo en el HTML del correo. */
function esc(texto: unknown) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function htmlRecordatorio(nombre: string, r: Reserva) {
  const c = r.cancha?.complejo
  const mapa = c?.lat != null && c?.lng != null
    ? `<p style="margin:16px 0 0"><a href="https://www.google.com/maps?q=${c.lat},${c.lng}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Cómo llegar (Google Maps)</a></p>`
    : ''
  return `
<div style="background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#16a34a;color:#fff;padding:20px 24px">
      <div style="font-size:22px;font-weight:800">⚽ CanchaYa</div>
      <div style="margin-top:4px;opacity:.9">Recordatorio: ¡mañana juegas!</div>
    </div>
    <div style="padding:24px;color:#111827">
      <p style="margin:0 0 12px">Hola ${esc(nombre)}, te recordamos tu reserva:</p>
      <p style="margin:0;font-size:18px;font-weight:700">${esc(c?.nombre)} · ${esc(r.cancha?.nombre)}</p>
      <p style="margin:4px 0 0">${esc(fechaLarga(r.fecha))}, de ${esc(r.hora_inicio.slice(0, 5))} a ${esc(r.hora_fin.slice(0, 5))}</p>
      <p style="margin:4px 0 0;color:#6b7280">${esc(c?.direccion)}, ${esc(c?.distrito)}</p>
      ${mapa}
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280">Llega 10 minutos antes. Si no puedes ir, cancela desde "Mis reservas" (hasta 2 horas antes).</p>
    </div>
  </div>
</div>`
}

Deno.serve(async (req) => {
  // 1) Autorización con el secreto compartido
  const secreto = Deno.env.get('CRON_SECRET') ?? ''
  const recibido = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!secreto || !igualSeguro(recibido, secreto)) {
    return json({ error: 'No autorizado' }, 401)
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'
  const fecha = url.searchParams.get('fecha') ?? mananaLima() // ?fecha= solo para pruebas

  // 2) Cliente con service role (salta RLS: necesita leer reservas de todos y el email en auth)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data, error } = await sb
    .from('reservas')
    .select('id, jugador_id, fecha, hora_inicio, hora_fin, cancha:canchas(nombre, complejo:complejos(nombre, direccion, distrito, lat, lng))')
    .eq('fecha', fecha)
    .eq('estado', 'pagada')
    .eq('es_bloqueo', false)
    .eq('recordatorio_enviado', false)
    .order('hora_inicio')
  if (error) return json({ error: error.message }, 500)
  const reservas = (data ?? []) as unknown as Reserva[]

  const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const remitente = Deno.env.get('EMAIL_FROM') ?? 'CanchaYa <onboarding@resend.dev>'
  const detalle: { reserva_id: string; destinatario: string; complejo: string; hora: string; estado: string }[] = []
  let enviados = 0
  let errores = 0

  for (const r of reservas) {
    // Email (vive en auth.users) y nombre del jugador
    const [{ data: u }, { data: perfil }] = await Promise.all([
      sb.auth.admin.getUserById(r.jugador_id),
      sb.from('profiles').select('nombre').eq('id', r.jugador_id).maybeSingle(),
    ])
    const destinatario = u?.user?.email ?? ''
    const fila = { reserva_id: r.id, destinatario, complejo: r.cancha?.complejo?.nombre ?? '', hora: r.hora_inicio.slice(0, 5), estado: 'dry_run' }

    if (dryRun) {
      detalle.push(fila)
      continue
    }

    let estado = 'enviado'
    let info = ''
    if (!destinatario || destinatario.endsWith('.demo')) {
      // Los usuarios demo (@canchaya.demo) no tienen buzón real: no se intenta enviar
      estado = 'omitido'
      info = 'correo de demostración sin buzón'
    } else if (!resendKey) {
      estado = 'omitido'
      info = 'RESEND_API_KEY no configurada'
    } else {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remitente,
          to: [destinatario],
          subject: `Recordatorio: mañana juegas en ${r.cancha?.complejo?.nombre ?? 'CanchaYa'} a las ${r.hora_inicio.slice(0, 5)}`,
          html: htmlRecordatorio(perfil?.nombre ?? 'jugador', r),
        }),
      })
      const cuerpo = await resp.json().catch(() => ({}))
      if (resp.ok) {
        info = `resend id ${cuerpo.id}`
        // Solo se marca si se envió: si falló, se puede reintentar
        await sb.from('reservas').update({ recordatorio_enviado: true }).eq('id', r.id)
      } else {
        estado = 'error'
        info = String(cuerpo.message ?? resp.status).slice(0, 500)
      }
      // El plan gratuito de Resend permite ~2 correos por segundo
      await new Promise((ok) => setTimeout(ok, 600))
    }

    if (estado === 'enviado') enviados++
    if (estado === 'error') errores++
    await sb.from('notificaciones_log').insert({ reserva_id: r.id, tipo: 'recordatorio', destinatario: destinatario || '(sin correo)', estado, detalle: info })
    detalle.push({ ...fila, estado })
  }

  return json({ dry_run: dryRun, fecha, encontradas: reservas.length, enviados, errores, detalle })
})
