"""Pagos con Stripe Checkout (modo prueba).

Flujo:
1. El jugador crea la reserva en Supabase (estado pendiente_pago).
2. POST /pagos/checkout → crear_checkout(): Stripe devuelve una URL de pago.
3. El jugador paga en Stripe y vuelve a /pago/exito?session_id=...
4. POST /pagos/verificar (o el webhook de Stripe) → confirmar_pago():
   marca la reserva como pagada, guarda el pago y envía el correo.

confirmar_pago() es IDEMPOTENTE: aunque lo llamen la página de éxito y el
webhook al mismo tiempo, la reserva se marca y el correo se envía una sola vez.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import stripe
from fastapi import HTTPException, status
from supabase import Client

from app.config import get_settings
from app.servicios import correo

# Columnas de la reserva con su cancha y complejo (join de PostgREST)
SELECT_RESERVA = (
    "id, jugador_id, fecha, hora_inicio, hora_fin, monto, estado, stripe_session_id, "
    "cancha:canchas(nombre, tipo, complejo:complejos(nombre, direccion, distrito, lat, lng))"
)


def configurar_stripe() -> None:
    """Pone la llave secreta de Stripe; 503 si falta (p. ej. en CI)."""
    s = get_settings()
    if not s.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe no está configurado en el backend")
    stripe.api_key = s.stripe_secret_key


def a_centavos(monto: float | str) -> int:
    """Stripe trabaja en la unidad mínima de la moneda: S/ 120.00 → 12000 céntimos."""
    return int(round(float(monto) * 100))


def hhmm(hora: str) -> str:
    return hora[:5]


def leer_reserva(sb: Client, reserva_id: str) -> dict:
    r = sb.table("reservas").select(SELECT_RESERVA).eq("id", reserva_id).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La reserva no existe")
    return r.data


def descripcion(reserva: dict) -> str:
    """'Reserva Cancha Misti - Yanahuara Fútbol Club - 2026-11-22 20:00'"""
    cancha = reserva.get("cancha") or {}
    complejo = cancha.get("complejo") or {}
    return (f'Reserva {cancha.get("nombre", "cancha")} - {complejo.get("nombre", "")} - '
            f'{reserva["fecha"]} {hhmm(reserva["hora_inicio"])}')


def crear_checkout(sb: Client, reserva_id: str, usuario_id: str) -> str:
    """Crea (o reutiliza) la Checkout Session de una reserva pendiente y devuelve su URL."""
    s = get_settings()
    configurar_stripe()
    reserva = leer_reserva(sb, reserva_id)

    # Solo el dueño de la reserva, y solo si sigue pendiente de pago
    if reserva["jugador_id"] != usuario_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta reserva no es tuya")
    if reserva["estado"] != "pendiente_pago":
        raise HTTPException(status.HTTP_409_CONFLICT, "La reserva ya no está pendiente de pago")

    # Si ya hay una sesión abierta (el jugador pulsó "Pagar" otra vez), se reutiliza
    if reserva.get("stripe_session_id"):
        previa = stripe.checkout.Session.retrieve(reserva["stripe_session_id"])
        if previa.status == "open":
            return previa.url

    front = s.cors_origins[0]
    sesion = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "quantity": 1,
            "price_data": {
                "currency": s.moneda,
                "unit_amount": a_centavos(reserva["monto"]),
                "product_data": {"name": descripcion(reserva)},
            },
        }],
        # {CHECKOUT_SESSION_ID} lo reemplaza Stripe por el id real al redirigir
        success_url=f"{front}/pago/exito?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{front}/pago/cancelado?reserva={reserva_id}",
        # Stripe exige mínimo 30 minutos; la limpieza de pendientes la expira antes si hace falta
        expires_at=int((datetime.now(ZoneInfo(s.timezone)) + timedelta(minutes=30)).timestamp()),
        metadata={"reserva_id": reserva_id, "jugador_id": usuario_id},
        client_reference_id=reserva_id,
    )
    sb.table("reservas").update({"stripe_session_id": sesion.id}).eq("id", reserva_id).execute()
    return sesion.url


def datos_comprobante(reserva: dict) -> dict:
    """Datos de la reserva listos para el correo y para la página de éxito."""
    cancha = reserva.get("cancha") or {}
    complejo = cancha.get("complejo") or {}
    return {
        "reserva_id": reserva["id"],
        "estado": reserva["estado"],
        "complejo": complejo.get("nombre", ""),
        "direccion": complejo.get("direccion", ""),
        "distrito": complejo.get("distrito", ""),
        "lat": complejo.get("lat"),
        "lng": complejo.get("lng"),
        "cancha": cancha.get("nombre", ""),
        "fecha": reserva["fecha"],
        "fecha_larga": correo.fecha_larga(reserva["fecha"]),
        "hora_inicio": hhmm(reserva["hora_inicio"]),
        "hora_fin": hhmm(reserva["hora_fin"]),
        "monto": f'S/ {float(reserva["monto"]):.2f}',
    }


def confirmar_pago(sb: Client, sesion) -> dict:
    """Marca como pagada la reserva de una sesión de Stripe ya pagada (idempotente).

    Devuelve el comprobante y si este llamado fue el que confirmó (primera vez).
    """
    reserva_id = (sesion.metadata or {}).get("reserva_id") or sesion.client_reference_id
    if not reserva_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sesión de Stripe no tiene reserva asociada")
    if sesion.payment_status != "paid":
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "El pago todavía no se completó")

    # UPDATE condicional = candado: solo UNA llamada cambia pendiente_pago → pagada.
    # Esa es la única que registra el pago y envía el correo.
    cambio = (
        sb.table("reservas")
        .update({"estado": "pagada", "stripe_session_id": sesion.id})
        .eq("id", reserva_id)
        .eq("estado", "pendiente_pago")
        .execute()
    )
    primera_vez = bool(cambio.data)

    if primera_vez:
        sb.table("pagos").upsert(
            {
                "reserva_id": reserva_id,
                "monto": sesion.amount_total / 100,
                "moneda": sesion.currency,
                "stripe_session_id": sesion.id,
                "stripe_payment_intent": sesion.payment_intent,
                "estado": "pagado",
            },
            on_conflict="stripe_session_id",
            ignore_duplicates=True,
        ).execute()

    reserva = leer_reserva(sb, reserva_id)
    comprobante = datos_comprobante(reserva)

    if primera_vez:
        # Correo al jugador (el email vive en auth.users, se lee con la service role)
        usuario = sb.auth.admin.get_user_by_id(reserva["jugador_id"]).user
        perfil = sb.table("profiles").select("nombre").eq("id", reserva["jugador_id"]).maybe_single().execute()
        nombre = (perfil.data or {}).get("nombre") if perfil else None
        comprobante["correo"] = correo.enviar_confirmacion(
            sb, usuario.email, {**comprobante, "nombre": nombre or "jugador"},
        )
    return {**comprobante, "primera_vez": primera_vez}


def minutos_expiracion(sb: Client) -> int:
    """Minutos de expiración: los define el admin en la tabla configuracion (Parte 7).

    Si la tabla no responde, se usa MINUTOS_EXPIRACION_PENDIENTE del entorno.
    """
    try:
        fila = sb.table("configuracion").select("minutos_expiracion").eq("id", 1).maybe_single().execute()
        if fila and fila.data:
            return int(fila.data["minutos_expiracion"])
    except Exception:  # noqa: BLE001 — la configuración es opcional
        pass
    return get_settings().minutos_expiracion_pendiente


def limpiar_pendientes(sb: Client) -> dict:
    """Cancela reservas pendiente_pago con más de N minutos y libera el horario.

    Si la reserva tiene una sesión de Stripe, primero se expira la sesión para
    que ya no se pueda pagar. Si resulta que SÍ se pagó (el webhook no llegó),
    se confirma el pago en lugar de cancelar.
    """
    minutos = minutos_expiracion(sb)
    limite = datetime.now(ZoneInfo("UTC")) - timedelta(minutes=minutos)
    pendientes = (
        sb.table("reservas").select("id, stripe_session_id")
        .eq("estado", "pendiente_pago").lt("created_at", limite.isoformat())
        .execute().data
    ) or []

    canceladas, confirmadas = 0, 0
    if any(p.get("stripe_session_id") for p in pendientes):
        configurar_stripe()
    for p in pendientes:
        sid = p.get("stripe_session_id")
        if sid:
            sesion = stripe.checkout.Session.retrieve(sid)
            if sesion.payment_status == "paid":
                confirmar_pago(sb, sesion)
                confirmadas += 1
                continue
            if sesion.status == "open":
                try:
                    stripe.checkout.Session.expire(sid)
                except stripe.StripeError:
                    # Carrera: el jugador pagó justo ahora → se confirma en vez de cancelar
                    sesion = stripe.checkout.Session.retrieve(sid)
                    if sesion.payment_status == "paid":
                        confirmar_pago(sb, sesion)
                        confirmadas += 1
                        continue
        r = sb.table("reservas").update({"estado": "cancelada"}).eq("id", p["id"]).eq("estado", "pendiente_pago").execute()
        canceladas += len(r.data or [])
    return {"revisadas": len(pendientes), "canceladas": canceladas, "confirmadas": confirmadas, "minutos": minutos}
