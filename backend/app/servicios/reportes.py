"""Genera el reporte PDF de reservas con reportlab."""
import io
from datetime import date, datetime
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERDE = colors.HexColor("#16a34a")


def resumen(filas: list[dict]) -> dict:
    """Totales del reporte: reservas que generan ingreso = pagadas o completadas (sin bloqueos)."""
    validas = [f for f in filas if f["tipo"] == "Reserva" and f["estado"] in ("Pagada", "Completada")]
    return {
        "total": len(filas),
        "validas": len(validas),
        "canceladas": sum(1 for f in filas if f["estado"] == "Cancelada"),
        "ingresos": sum(float(f["monto"]) for f in validas),
    }


def generar_pdf(filas: list[dict], titulo: str, desde: date, hasta: date) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                            topMargin=1.5 * cm, bottomMargin=1.5 * cm, title="Reporte de reservas - CanchaYa")
    estilos = getSampleStyleSheet()
    r = resumen(filas)
    generado = datetime.now(ZoneInfo("America/Lima")).strftime("%d/%m/%Y %H:%M")

    elementos = [
        Paragraph("<font color='#16a34a'><b>CanchaYa</b></font> · Reporte de reservas", estilos["Title"]),
        Paragraph(f"<b>{titulo}</b>", estilos["Normal"]),
        Paragraph(f"Del {desde:%d/%m/%Y} al {hasta:%d/%m/%Y} · generado el {generado} (hora de Lima)", estilos["Normal"]),
        Spacer(1, 0.4 * cm),
        Paragraph(
            f"Reservas pagadas/completadas: <b>{r['validas']}</b> · Canceladas: <b>{r['canceladas']}</b> · "
            f"Ingresos: <b>S/ {r['ingresos']:,.2f}</b>", estilos["Normal"]),
        Spacer(1, 0.4 * cm),
    ]

    encabezado = ["Fecha", "Horario", "Complejo", "Cancha", "Cliente", "Tipo", "Estado", "Monto (S/)"]
    datos = [encabezado] + [
        [f["fecha"], f'{f["hora_inicio"]}-{f["hora_fin"]}', f["complejo"][:28], f["cancha"][:22],
         f["cliente"][:24], f["tipo"], f["estado"], f["monto"]]
        for f in filas
    ]
    if len(datos) == 1:
        datos.append(["—", "", "Sin reservas en el rango", "", "", "", "", ""])

    tabla = Table(datos, repeatRows=1, colWidths=[2.3 * cm, 2.5 * cm, 5 * cm, 4 * cm, 4.5 * cm, 2 * cm, 3.2 * cm, 2.5 * cm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, VERDE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elementos.append(tabla)
    doc.build(elementos)
    return buf.getvalue()
