"""Endpoints del panel de administración.

Todos exigen rol admin + sesión con MFA (require_role("admin") pide AAL2).
Usan la service role porque tocan cosas que RLS no deja hacer desde el
navegador: cambiar roles, suspender cuentas (Supabase Auth), aprobar complejos.

- GET   /admin/resumen                       → usuarios por rol, MFA, crecimiento semanal, complejos por estado
- GET   /admin/usuarios?q=&rol=              → usuarios con email, rol, MFA y si están suspendidos
- PATCH /admin/usuarios/{id}/rol             → cambiar rol
- POST  /admin/usuarios/{id}/suspension      → suspender / reactivar (ban en Supabase Auth)
- GET   /admin/complejos                     → todos los complejos con su dueño
- PATCH /admin/complejos/{id}/estado         → aprobar (activo), suspender o devolver a pendiente
- POST  /admin/recordatorios?dry_run=true    → ejecuta la Edge Function send-reminders ahora
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps import Usuario, get_supabase, require_role

router = APIRouter(prefix="/admin", tags=["admin"])
solo_admin = require_role("admin")

# "Suspender para siempre" en Supabase Auth = ban de ~100 años
BAN_INDEFINIDO = "876000h"
SEMANAS_CRECIMIENTO = 12


class RolIn(BaseModel):
    rol: Literal["admin", "propietario", "jugador"]


class SuspensionIn(BaseModel):
    suspender: bool


class EstadoComplejoIn(BaseModel):
    estado: Literal["pendiente", "activo", "suspendido"]


def _suspendido(banned_until: str | None) -> bool:
    if not banned_until:
        return False
    return datetime.fromisoformat(banned_until) > datetime.now(timezone.utc)


def listar_usuarios() -> list[dict]:
    """Usuarios de auth + profiles + MFA (función SQL solo para la service role)."""
    filas = get_supabase().rpc("admin_listar_usuarios").execute().data or []
    for f in filas:
        f["suspendido"] = _suspendido(f.pop("banned_until"))
    return filas


@router.get("/usuarios")
def usuarios(q: str = "", rol: str = "", _: Usuario = Depends(solo_admin)) -> list[dict]:
    texto = q.strip().lower()
    return [
        u for u in listar_usuarios()
        if (not rol or u["rol"] == rol)
        and (not texto or texto in (u["email"] or "").lower() or texto in (u["nombre"] or "").lower())
    ]


@router.patch("/usuarios/{usuario_id}/rol")
def cambiar_rol(usuario_id: str, datos: RolIn, admin: Usuario = Depends(solo_admin)) -> dict:
    if usuario_id == admin.id and datos.rol != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes quitarte el rol de administrador a ti mismo")
    r = get_supabase().table("profiles").update({"rol": datos.rol}).eq("id", usuario_id).execute()
    if not r.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    return {"id": usuario_id, "rol": datos.rol}


@router.post("/usuarios/{usuario_id}/suspension")
def suspender(usuario_id: str, datos: SuspensionIn, admin: Usuario = Depends(solo_admin)) -> dict:
    """Suspender = "ban" en Supabase Auth: no puede iniciar sesión ni renovar su token."""
    if usuario_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes suspender tu propia cuenta")
    duracion = BAN_INDEFINIDO if datos.suspender else "none"
    try:
        get_supabase().auth.admin.update_user_by_id(usuario_id, {"ban_duration": duracion})
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No se pudo actualizar el usuario: {e}") from e
    return {"id": usuario_id, "suspendido": datos.suspender}


@router.get("/complejos")
def complejos(_: Usuario = Depends(solo_admin)) -> list[dict]:
    sb = get_supabase()
    filas = (
        sb.table("complejos")
        .select("id, nombre, direccion, distrito, lat, lng, foto_url, estado, created_at, propietario_id, canchas(id)")
        .order("created_at", desc=True).execute().data or []
    )
    duenos = {u["id"]: u for u in listar_usuarios()}
    for c in filas:
        d = duenos.get(c["propietario_id"]) or {}
        c["propietario"] = {"nombre": d.get("nombre"), "email": d.get("email"), "rol": d.get("rol")}
        c["num_canchas"] = len(c.pop("canchas") or [])
    return filas


@router.patch("/complejos/{complejo_id}/estado")
def cambiar_estado_complejo(complejo_id: str, datos: EstadoComplejoIn, _: Usuario = Depends(solo_admin)) -> dict:
    """Aprobar = estado 'activo' y, si el dueño aún es jugador, pasa a 'propietario'."""
    sb = get_supabase()
    r = sb.table("complejos").update({"estado": datos.estado}).eq("id", complejo_id).execute()
    if not r.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complejo no encontrado")
    complejo = r.data[0]
    rol_cambiado = False
    if datos.estado == "activo" and complejo.get("propietario_id"):
        cambio = (
            sb.table("profiles").update({"rol": "propietario"})
            .eq("id", complejo["propietario_id"]).eq("rol", "jugador").execute()
        )
        rol_cambiado = bool(cambio.data)
    return {"id": complejo_id, "estado": datos.estado, "dueno_ahora_es_propietario": rol_cambiado}


def crecimiento_semanal(fechas: list[str], semanas: int = SEMANAS_CRECIMIENTO) -> list[dict]:
    """Nuevos usuarios por semana (lunes) y total acumulado, últimas N semanas."""
    def lunes(d: datetime):
        return (d - timedelta(days=d.weekday())).date()

    creados = [datetime.fromisoformat(f) for f in fechas]
    por_semana = Counter(lunes(d) for d in creados)
    hoy = lunes(datetime.now(timezone.utc))
    inicio = hoy - timedelta(weeks=semanas - 1)
    acumulado = sum(1 for d in creados if lunes(d) < inicio)
    salida = []
    for i in range(semanas):
        semana = inicio + timedelta(weeks=i)
        acumulado += por_semana.get(semana, 0)
        salida.append({"semana": semana.isoformat(), "nuevos": por_semana.get(semana, 0), "total": acumulado})
    return salida


@router.get("/resumen")
def resumen(_: Usuario = Depends(solo_admin)) -> dict:
    usuarios_ = listar_usuarios()
    estados = get_supabase().table("complejos").select("estado").execute().data or []
    return {
        "usuarios_por_rol": dict(Counter(u["rol"] for u in usuarios_)),
        "usuarios_total": len(usuarios_),
        "usuarios_con_mfa": sum(1 for u in usuarios_ if u["mfa"]),
        "usuarios_suspendidos": sum(1 for u in usuarios_ if u["suspendido"]),
        "complejos_por_estado": dict(Counter(c["estado"] for c in estados)),
        "crecimiento": crecimiento_semanal([u["created_at"] for u in usuarios_]),
    }


@router.post("/recordatorios")
def ejecutar_recordatorios(dry_run: bool = True, _: Usuario = Depends(solo_admin)) -> dict:
    """Invoca la Edge Function send-reminders (Parte 8) con el secreto compartido."""
    s = get_settings()
    if not s.cron_secret or not s.supabase_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Falta CRON_SECRET o SUPABASE_URL en el backend")
    url = f"{s.supabase_url}/functions/v1/send-reminders"
    try:
        r = httpx.post(url, params={"dry_run": str(dry_run).lower()},
                       headers={"Authorization": f"Bearer {s.cron_secret}"}, timeout=60)
    except httpx.HTTPError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo llamar a la Edge Function: {e}") from e
    if r.status_code >= 400:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"La Edge Function respondió {r.status_code}: {r.text[:300]}")
    return r.json()
