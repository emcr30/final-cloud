"""Endpoints de reservas que necesitan el backend (Stripe).

- POST /reservas/{id}/cancelar → expira la sesión de Stripe y cancela la reserva.
  Lo usan "Mis reservas" (jugador) y la Agenda (propietario).
"""
from fastapi import APIRouter, Depends

from app.deps import Usuario, get_supabase, get_usuario_actual
from app.servicios import reservas

router = APIRouter(prefix="/reservas", tags=["reservas"])


@router.post("/{reserva_id}/cancelar")
def cancelar(reserva_id: str, usuario: Usuario = Depends(get_usuario_actual)) -> dict:
    """Jugador dueño (más de 2 h antes) o propietario de la cancha (con MFA)."""
    return reservas.cancelar_reserva(get_supabase(), reserva_id, usuario)
