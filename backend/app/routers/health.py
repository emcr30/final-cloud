"""Endpoint de salud: lo usan Render (health check) y UptimeRobot (monitoreo)."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from app.config import get_settings
from app.limites import limiter

router = APIRouter(tags=["salud"])


@router.get("/health")
@limiter.exempt  # lo llaman Render y UptimeRobot cada pocos minutos
def health() -> dict:
    """Devuelve el estado del servicio y la hora actual en Lima."""
    s = get_settings()
    return {
        "estado": "ok",
        "servicio": "canchaya-api",
        "entorno": s.environment,
        "hora": datetime.now(ZoneInfo(s.timezone)).isoformat(timespec="seconds"),
    }


@router.get("/health/servicios")
def servicios() -> dict:
    """Qué integraciones tiene configuradas el backend (sin mostrar ningún valor).

    Supabase se prueba de verdad con una consulta mínima; Stripe y Resend solo
    se informa si tienen llave (llamarlos en cada chequeo gastaría cuota).
    """
    s = get_settings()
    supabase_ok = False
    if s.supabase_url and s.supabase_service_role_key:
        try:
            from app.deps import get_supabase  # import local: /health no debe depender de Supabase

            get_supabase().table("configuracion").select("id").limit(1).execute()
            supabase_ok = True
        except Exception:  # noqa: BLE001
            supabase_ok = False
    return {
        "supabase": supabase_ok,
        "stripe": bool(s.stripe_secret_key),
        "stripe_webhook": bool(s.stripe_webhook_secret),
        "resend": bool(s.resend_api_key),
        "cron_secret": bool(s.cron_secret),
    }
