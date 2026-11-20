"""Endpoint de salud: lo usan Render (health check) y UptimeRobot (monitoreo)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["salud"])


@router.get("/health")
def health() -> dict:
    """Devuelve el estado del servicio y la hora actual en Lima."""
    s = get_settings()
    return {
        "estado": "ok",
        "servicio": "canchaya-api",
        "entorno": s.environment,
        "hora": datetime.now(ZoneInfo(s.timezone)).isoformat(timespec="seconds"),
    }
