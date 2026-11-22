"""Cancelación de reservas desde el backend.

¿Por qué no se cancela directo en Supabase desde el navegador? Porque una
reserva pendiente puede tener una sesión de Stripe Checkout abierta (dura
30 min). Si solo cambiamos el estado a 'cancelada', el jugador todavía puede
volver a esa pestaña y pagar. Aquí primero se EXPIRA la sesión en Stripe
(ya no se puede pagar) y recién después se cancela la reserva.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import stripe
from fastapi import HTTPException, status
from supabase import Client

from app.config import get_settings
from app.deps import Usuario
from app.servicios import pagos

# Igual que la política RLS "reservas: el jugador cancela las suyas"
HORAS_MINIMAS_CANCELACION = 2
ESTADOS_CANCELABLES = ("pendiente_pago", "pagada")


def leer_para_cancelar(sb: Client, reserva_id: str) -> dict:
    """Reserva con el dueño del complejo (para saber si quien cancela es el propietario)."""
    r = (
        sb.table("reservas")
        .select("id, jugador_id, fecha, hora_inicio, estado, stripe_session_id, "
                "cancha:canchas(complejo:complejos(propietario_id))")
        .eq("id", reserva_id).maybe_single().execute()
    )
    if not r or not r.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La reserva no existe")
    return r.data


def faltan_mas_de_2_horas(reserva: dict) -> bool:
    """¿El partido empieza en más de 2 horas? (hora de Lima)"""
    tz = ZoneInfo(get_settings().timezone)
    inicio = datetime.fromisoformat(f'{reserva["fecha"]}T{reserva["hora_inicio"]}').replace(tzinfo=tz)
    return inicio > datetime.now(tz) + timedelta(hours=HORAS_MINIMAS_CANCELACION)


def autorizar(usuario: Usuario, reserva: dict) -> None:
    """Puede cancelar: el propietario de la cancha (con MFA) o el jugador dueño (con la regla de 2 h)."""
    propietario_id = ((reserva.get("cancha") or {}).get("complejo") or {}).get("propietario_id")
    if propietario_id and propietario_id == usuario.id:
        if usuario.aal != "aal2":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere verificación en dos pasos (MFA)")
        return
    if reserva["jugador_id"] == usuario.id:
        if not faltan_mas_de_2_horas(reserva):
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "Ya no se puede cancelar: faltan menos de 2 horas para el partido.")
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes cancelar esta reserva")


def cancelar_reserva(sb: Client, reserva_id: str, usuario: Usuario) -> dict:
    """Cierra el pago en Stripe y cancela la reserva.

    Devuelve {"resultado": "cancelada"} o, si al revisar Stripe resulta que el
    pago ya se había completado, confirma el pago y devuelve {"resultado": "pagada"}.
    """
    reserva = leer_para_cancelar(sb, reserva_id)
    autorizar(usuario, reserva)
    if reserva["estado"] not in ESTADOS_CANCELABLES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta reserva ya no se puede cancelar")

    # 1) Cerrar la sesión de Stripe (solo importa si aún no estaba pagada en nuestra base)
    sid = reserva.get("stripe_session_id")
    if reserva["estado"] == "pendiente_pago" and sid:
        try:
            pagada = pagos.cerrar_sesion(sid)
        except stripe.StripeError as e:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                                "No pudimos cerrar el pago en Stripe; intenta de nuevo en un momento.") from e
        if pagada:
            # El jugador ya pagó: en lugar de cancelar se confirma la reserva
            pagos.confirmar_pago(sb, pagada)
            return {"reserva_id": reserva_id, "resultado": "pagada",
                    "mensaje": "No se canceló: el pago ya se había completado y la reserva quedó confirmada."}

    # 2) Cancelar (UPDATE condicional: si otro proceso cambió el estado, no pisa nada)
    cambio = (
        sb.table("reservas").update({"estado": "cancelada"})
        .eq("id", reserva_id).in_("estado", list(ESTADOS_CANCELABLES))
        .execute()
    )
    if not cambio.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "La reserva cambió de estado; recarga la página")
    return {"reserva_id": reserva_id, "resultado": "cancelada", "mensaje": "Reserva cancelada."}
