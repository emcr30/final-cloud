"""Correos con Resend + registro en notificaciones_log.

Sin dominio propio, Resend solo entrega desde onboarding@resend.dev hacia el
correo dueño de la cuenta de Resend. Si falla el envío NO se cae el pago:
se registra el error en notificaciones_log para verlo en el panel admin.
"""
from datetime import date
from html import escape

import resend
from supabase import Client

from app.config import get_settings

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(fecha_iso: str) -> str:
    """'2026-11-22' → 'domingo 22 de noviembre de 2026' (sin depender del locale del servidor)."""
    d = date.fromisoformat(fecha_iso)
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]} de {d.year}"


def html_confirmacion(datos: dict) -> str:
    """Plantilla HTML del correo de confirmación (estilos en línea: los clientes de correo no leen CSS externo)."""
    e = {k: escape(str(v)) for k, v in datos.items()}  # evita inyectar HTML con nombres o direcciones
    mapa = ""
    if datos.get("lat") is not None and datos.get("lng") is not None:
        mapa = (f'<p style="margin:16px 0 0"><a href="https://www.google.com/maps?q={datos["lat"]},{datos["lng"]}" '
                'style="color:#15803d;font-weight:600">Ver ubicación en Google Maps →</a></p>')
    fila = ('<tr><td style="padding:6px 0;color:#6b7280">{}</td>'
            '<td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">{}</td></tr>')
    filas = "".join(fila.format(k, v) for k, v in [
        ("Complejo", e["complejo"]),
        ("Cancha", e["cancha"]),
        ("Fecha", e["fecha_larga"]),
        ("Horario", f'{e["hora_inicio"]} – {e["hora_fin"]}'),
        ("Dirección", f'{e["direccion"]}, {e["distrito"]}'),
        ("Total pagado", e["monto"]),
    ])
    return f"""\
<div style="background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <div style="background:#16a34a;color:#ffffff;padding:20px 24px">
      <div style="font-size:22px;font-weight:800">⚽ CanchaYa</div>
      <div style="margin-top:4px;opacity:.9">¡Tu reserva está confirmada!</div>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 16px;color:#111827">Hola {e["nombre"]}, recibimos tu pago. Estos son los datos de tu partido:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">{filas}</table>
      {mapa}
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280">
        Código de reserva: {e["reserva_id"]}<br>
        Puedes cancelar hasta 2 horas antes desde "Mis reservas".
      </p>
    </div>
  </div>
</div>"""


def registrar(sb: Client, reserva_id: str, tipo: str, destinatario: str, estado: str, detalle: str | None = None) -> None:
    """Guarda el intento de envío en notificaciones_log (auditoría)."""
    sb.table("notificaciones_log").insert({
        "reserva_id": reserva_id, "tipo": tipo, "destinatario": destinatario,
        "estado": estado, "detalle": detalle,
    }).execute()


def enviar_confirmacion(sb: Client, destinatario: str, datos: dict) -> str:
    """Envía el correo de confirmación y lo registra. Devuelve el estado: enviado | error | omitido."""
    s = get_settings()
    if not s.resend_api_key:
        registrar(sb, datos["reserva_id"], "confirmacion", destinatario, "omitido", "RESEND_API_KEY no configurada")
        return "omitido"
    resend.api_key = s.resend_api_key
    try:
        r = resend.Emails.send({
            "from": s.email_from,
            "to": [destinatario],
            "subject": f'Reserva confirmada: {datos["complejo"]} · {datos["fecha_larga"]} {datos["hora_inicio"]}',
            "html": html_confirmacion(datos),
        })
        registrar(sb, datos["reserva_id"], "confirmacion", destinatario, "enviado", f"resend id {r.get('id')}")
        return "enviado"
    except Exception as e:  # noqa: BLE001 — cualquier fallo de Resend se registra, no se propaga
        registrar(sb, datos["reserva_id"], "confirmacion", destinatario, "error", str(e)[:500])
        return "error"
