"""Pagos con Stripe Checkout (modo prueba).

Flujo:
1. El jugador crea la reserva en Supabase (estado pendiente_pago).
2. POST /pagos/checkout → crear_checkout(): Stripe devuelve una URL de pago.
3. El jugador paga en Stripe y vuelve a /pago/exito?session_id=...
4. POST /pagos/verificar (o el webhook de Stripe) → confirmar_pago():
   marca la reserva como pagada, guarda el pago y envía el correo.

confirmar_pago() es IDEMPOTENTE: aunque lo llamen la página de éxito y el
webhook al mismo tiempo, la reserva se marca y el correo se envía una sola vez.

Caso borde: si Stripe cobró pero la reserva ya no estaba pendiente (el jugador
o el propietario la canceló con la pestaña de Stripe todavía abierta), se
devuelve el dinero automáticamente (reembolsar_pago_huerfano).
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


def formato_monto(centavos: int, moneda: str) -> str:
    """12000, 'pen' → 'S/ 120.00'  ·  12000, 'usd' → 'USD 120.00'."""
    simbolo = "S/" if moneda.lower() == "pen" else moneda.upper()
    return f"{simbolo} {centavos / 100:.2f}"


def datos_jugador(sb: Client, jugador_id: str) -> tuple[str, str]:
    """(email, nombre) del jugador. El email vive en auth.users: se lee con la service role."""
    usuario = sb.auth.admin.get_user_by_id(jugador_id).user
    perfil = sb.table("profiles").select("nombre").eq("id", jugador_id).maybe_single().execute()
    nombre = (perfil.data or {}).get("nombre") if perfil else None
    return usuario.email, nombre or "jugador"


def confirmar_pago(sb: Client, sesion) -> dict:
    """Procesa una sesión de Stripe (la llaman /pagos/verificar, el webhook y la limpieza).

    Devuelve el comprobante con un campo `resultado` para el frontend:
    - "pagada":      el pago quedó registrado y la reserva confirmada.
    - "reembolsada": Stripe cobró pero la reserva ya no estaba pendiente
                     (se canceló antes de pagar) → se devolvió el dinero.
    - "pendiente":   Stripe todavía no confirma el pago.
    Es idempotente: llamarla dos veces (o a la vez) da el mismo resultado,
    un solo correo y, si corresponde, un solo reembolso.
    """
    reserva_id = (sesion.metadata or {}).get("reserva_id") or sesion.client_reference_id
    if not reserva_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sesión de Stripe no tiene reserva asociada")

    if sesion.payment_status != "paid":
        reserva = leer_reserva(sb, reserva_id)
        return {**datos_comprobante(reserva), "resultado": "pendiente", "primera_vez": False}

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
        email, nombre = datos_jugador(sb, reserva["jugador_id"])
        comprobante["correo"] = correo.enviar_confirmacion(sb, email, {**comprobante, "nombre": nombre})
        return {**comprobante, "resultado": "pagada", "primera_vez": True}

    # La reserva NO estaba pendiente. ¿Ya la confirmó esta misma sesión antes
    # (segunda llamada de la página de éxito o del webhook)? → todo bien.
    if reserva["estado"] in ("pagada", "completada") and reserva.get("stripe_session_id") == sesion.id:
        return {**comprobante, "resultado": "pagada", "primera_vez": False}

    # Si no: Stripe cobró una reserva cancelada (o cuyo horario ya es de otra
    # persona). Ese dinero no corresponde → se devuelve.
    return reembolsar_pago_huerfano(sb, sesion, reserva, comprobante)


def reembolsar_pago_huerfano(sb: Client, sesion, reserva: dict, comprobante: dict) -> dict:
    """Devuelve en Stripe el pago de una reserva que ya no estaba pendiente.

    Idempotencia (verificación y webhook pueden llegar a la vez):
    1. "Reclamamos" el reembolso insertando la fila en `pagos` con estado
       'reembolsado'. stripe_session_id es UNIQUE: solo UNA llamada logra
       insertarla; las demás ven la fila existente y no reembolsan otra vez.
    2. Además el Refund lleva idempotency_key = id de la sesión: aunque se
       llamara dos veces, Stripe crea un solo reembolso.
    """
    monto_txt = formato_monto(sesion.amount_total, sesion.currency)
    reclamo = sb.table("pagos").upsert(
        {
            "reserva_id": reserva["id"],
            "monto": sesion.amount_total / 100,
            "moneda": sesion.currency,
            "stripe_session_id": sesion.id,
            "stripe_payment_intent": sesion.payment_intent,
            "estado": "reembolsado",
        },
        on_conflict="stripe_session_id",
        ignore_duplicates=True,  # ON CONFLICT DO NOTHING: si ya existe, data = []
    ).execute()

    if not reclamo.data:
        # Otra llamada ya registró esta sesión: respondemos según lo que guardó
        previo = (
            sb.table("pagos").select("estado").eq("stripe_session_id", sesion.id)
            .maybe_single().execute()
        )
        estado_previo = (previo.data or {}).get("estado") if previo else None
        resultado = "pagada" if estado_previo == "pagado" else "reembolsada"
        return {**comprobante, "resultado": resultado, "monto_reembolsado": monto_txt, "primera_vez": False}

    # Somos la única llamada que reembolsa
    configurar_stripe()
    try:
        reembolso = stripe.Refund.create(
            payment_intent=sesion.payment_intent,
            reason="requested_by_customer",
            metadata={"reserva_id": reserva["id"], "motivo": "reserva cancelada antes del pago"},
            idempotency_key=f"reembolso-{sesion.id}",
        )
    except stripe.StripeError as e:
        # Se borra el reclamo para que el próximo intento (p. ej. el reintento del webhook) lo haga
        sb.table("pagos").delete().eq("stripe_session_id", sesion.id).is_("stripe_refund_id", "null").execute()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo reembolsar en Stripe: {e.user_message or e}") from e

    sb.table("pagos").update({"stripe_refund_id": reembolso.id}).eq("stripe_session_id", sesion.id).execute()

    email, nombre = datos_jugador(sb, reserva["jugador_id"])
    estado_correo = correo.enviar_reembolso(
        sb, email, {**comprobante, "nombre": nombre, "monto_reembolsado": monto_txt},
    )
    return {**comprobante, "resultado": "reembolsada", "monto_reembolsado": monto_txt,
            "correo": estado_correo, "primera_vez": True}


def cerrar_sesion(sid: str):
    """Deja la sesión de Stripe sin posibilidad de pago (la expira si sigue abierta).

    Devuelve la sesión si resultó que YA estaba pagada (el que llama debe
    confirmar el pago en vez de cancelar), o None si ya no se puede pagar.
    """
    configurar_stripe()
    sesion = stripe.checkout.Session.retrieve(sid)
    if sesion.payment_status == "paid":
        return sesion
    if sesion.status == "open":
        try:
            stripe.checkout.Session.expire(sid)
        except stripe.StripeError:
            # Carrera: el jugador pagó (o la sesión venció) justo en este momento
            sesion = stripe.checkout.Session.retrieve(sid)
            if sesion.payment_status == "paid":
                return sesion
            if sesion.status == "open":
                raise  # sigue abierta y no pudimos cerrarla: no es seguro cancelar
    return None


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
    for p in pendientes:
        sid = p.get("stripe_session_id")
        if sid:
            pagada = cerrar_sesion(sid)
            if pagada:
                # El webhook no llegó pero sí pagó → se confirma en vez de cancelar
                confirmar_pago(sb, pagada)
                confirmadas += 1
                continue
        r = sb.table("reservas").update({"estado": "cancelada"}).eq("id", p["id"]).eq("estado", "pendiente_pago").execute()
        canceladas += len(r.data or [])
    return {"revisadas": len(pendientes), "canceladas": canceladas, "confirmadas": confirmadas, "minutos": minutos}
