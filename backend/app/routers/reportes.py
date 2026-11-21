"""Reportes exportables (CSV y PDF) de reservas.

- GET /reportes/export?formato=csv|pdf&desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&complejo_id=...]

Propietario: solo reservas de SUS complejos. Admin: de toda la plataforma.
Requiere MFA (require_role exige AAL2 para estos roles).

El backend usa la service role (salta RLS), así que el filtro por dueño se
hace aquí explícitamente: primero se buscan los complejos permitidos y solo
se leen reservas de sus canchas.
"""
import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from supabase import Client

from app.deps import Usuario, get_supabase, require_role
from app.servicios.reportes import generar_pdf

router = APIRouter(prefix="/reportes", tags=["reportes"])

# Máximo de días por reporte (evita consultas gigantes por accidente)
MAX_DIAS = 366

COLUMNAS = ["fecha", "hora_inicio", "hora_fin", "complejo", "cancha", "cliente", "tipo", "estado", "monto"]
ESTADOS = {"pendiente_pago": "Pendiente de pago", "pagada": "Pagada", "cancelada": "Cancelada", "completada": "Completada"}


def complejos_permitidos(sb: Client, usuario: Usuario, complejo_id: str | None) -> dict[str, str]:
    """{id: nombre} de los complejos que este usuario puede reportar."""
    q = sb.table("complejos").select("id, nombre")
    if usuario.rol != "admin":
        q = q.eq("propietario_id", usuario.id)  # aislamiento multi-tenant
    if complejo_id:
        q = q.eq("id", complejo_id)
    filas = q.execute().data or []
    if complejo_id and not filas:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complejo no encontrado")
    return {c["id"]: c["nombre"] for c in filas}


def leer_reservas(sb: Client, complejos: dict[str, str], desde: date, hasta: date) -> list[dict]:
    """Reservas del rango para esos complejos, ya "aplanadas" para el reporte."""
    if not complejos:
        return []
    canchas = sb.table("canchas").select("id, nombre, complejo_id").in_("complejo_id", list(complejos)).execute().data or []
    info_cancha = {c["id"]: c for c in canchas}
    if not info_cancha:
        return []

    # La API devuelve como máximo 1000 filas por consulta: se pagina
    filas, inicio, paso = [], 0, 1000
    while True:
        lote = (
            sb.table("reservas")
            .select("fecha, hora_inicio, hora_fin, estado, monto, es_bloqueo, cancha_id, jugador:profiles(nombre)")
            .in_("cancha_id", list(info_cancha))
            .gte("fecha", desde.isoformat()).lte("fecha", hasta.isoformat())
            .order("fecha").order("hora_inicio")
            .range(inicio, inicio + paso - 1)
            .execute().data or []
        )
        filas.extend(lote)
        if len(lote) < paso:
            break
        inicio += paso

    salida = []
    for r in filas:
        cancha = info_cancha[r["cancha_id"]]
        salida.append({
            "fecha": r["fecha"],
            "hora_inicio": r["hora_inicio"][:5],
            "hora_fin": r["hora_fin"][:5],
            "complejo": complejos[cancha["complejo_id"]],
            "cancha": cancha["nombre"],
            "cliente": (r.get("jugador") or {}).get("nombre", ""),
            "tipo": "Bloqueo" if r.get("es_bloqueo") else "Reserva",
            "estado": ESTADOS.get(r["estado"], r["estado"]),
            "monto": f'{float(r["monto"]):.2f}',
        })
    return salida


@router.get("/export")
def exportar(
    formato: str = Query("csv", pattern="^(csv|pdf)$"),
    desde: date = Query(...),
    hasta: date = Query(...),
    complejo_id: str | None = None,
    usuario: Usuario = Depends(require_role("propietario", "admin")),
):
    """Descarga las reservas del rango en CSV (Excel) o PDF."""
    if hasta < desde:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "'hasta' debe ser posterior a 'desde'")
    if (hasta - desde).days > MAX_DIAS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"El rango máximo es de {MAX_DIAS} días")

    sb = get_supabase()
    complejos = complejos_permitidos(sb, usuario, complejo_id)
    filas = leer_reservas(sb, complejos, desde, hasta)
    nombre = f"reservas_{desde}_{hasta}.{formato}"
    cabecera = {"Content-Disposition": f'attachment; filename="{nombre}"'}

    if formato == "csv":
        buf = io.StringIO()
        buf.write("﻿")  # BOM: Excel abre bien las tildes
        w = csv.DictWriter(buf, fieldnames=COLUMNAS)
        w.writeheader()
        w.writerows(filas)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8", headers=cabecera)

    titulo = "Todos los complejos" if usuario.rol == "admin" and not complejo_id else ", ".join(complejos.values())
    pdf = generar_pdf(filas, titulo, desde, hasta)
    return StreamingResponse(iter([pdf]), media_type="application/pdf", headers=cabecera)
