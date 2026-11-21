"""Tareas programadas que llama pg_cron (Parte 8) o se pueden ejecutar a mano.

Se protegen con un secreto compartido en el header X-Cron-Secret (no usan
token de usuario porque las llama la base de datos, no una persona).
"""
import hmac

from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings
from app.deps import get_supabase
from app.servicios import pagos

router = APIRouter(prefix="/tareas", tags=["tareas"])


def verificar_cron(secreto: str | None) -> None:
    """401 si el header no coincide con CRON_SECRET (comparación en tiempo constante)."""
    esperado = get_settings().cron_secret
    if not esperado or not secreto or not hmac.compare_digest(secreto, esperado):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Cron-Secret inválido")


@router.post("/limpiar-pendientes")
def limpiar_pendientes(x_cron_secret: str | None = Header(default=None)) -> dict:
    """Cancela reservas pendiente_pago con más de 15 minutos (libera el horario)."""
    verificar_cron(x_cron_secret)
    return pagos.limpiar_pendientes(get_supabase())
