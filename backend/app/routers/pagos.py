"""Endpoints de pago con Stripe Checkout (modo prueba).

- POST /pagos/checkout   {reserva_id}  → URL de pago de Stripe (jugador dueño de la reserva)
- POST /pagos/verificar  {session_id}  → confirma el pago al volver de Stripe y devuelve el comprobante
- POST /pagos/webhook                  → Stripe avisa "checkout.session.completed" (firma verificada)

Tarjeta de prueba: 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC.
"""
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps import Usuario, get_supabase, get_usuario_actual
from app.servicios import pagos

router = APIRouter(prefix="/pagos", tags=["pagos"])


class CheckoutIn(BaseModel):
    reserva_id: str


class VerificarIn(BaseModel):
    session_id: str


@router.post("/checkout")
def checkout(datos: CheckoutIn, usuario: Usuario = Depends(get_usuario_actual)) -> dict:
    """Crea la Checkout Session de una reserva pendiente del usuario y devuelve su URL."""
    try:
        url = pagos.crear_checkout(get_supabase(), datos.reserva_id, usuario.id)
    except stripe.StripeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe rechazó la operación: {e.user_message or e}") from e
    return {"url": url}


@router.post("/verificar")
def verificar(datos: VerificarIn, usuario: Usuario = Depends(get_usuario_actual)) -> dict:
    """Consulta la sesión en Stripe; si está pagada confirma la reserva (idempotente)."""
    pagos.configurar_stripe()
    try:
        sesion = stripe.checkout.Session.retrieve(datos.session_id)
    except stripe.StripeError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No se encontró la sesión de pago") from e

    # Solo el jugador que pagó (o un admin) puede ver este comprobante
    dueno = (sesion.metadata or {}).get("jugador_id")
    if dueno != usuario.id and usuario.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Este pago no es tuyo")

    return pagos.confirmar_pago(get_supabase(), sesion)


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request) -> dict:
    """Webhook de Stripe. Funciona solo si STRIPE_WEBHOOK_SECRET está configurado.

    La firma (header Stripe-Signature) prueba que el aviso viene de Stripe y no de un tercero.
    """
    s = get_settings()
    if not s.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook no configurado (falta STRIPE_WEBHOOK_SECRET)")
    pagos.configurar_stripe()

    cuerpo = await request.body()
    firma = request.headers.get("stripe-signature", "")
    try:
        evento = stripe.Webhook.construct_event(cuerpo, firma, s.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Firma de Stripe inválida") from e

    if evento.type == "checkout.session.completed":
        sesion = evento.data.object
        if sesion.payment_status == "paid":
            pagos.confirmar_pago(get_supabase(), sesion)
    # A Stripe siempre se le responde 200 si el evento es válido (aunque no nos interese)
    return {"recibido": True}
