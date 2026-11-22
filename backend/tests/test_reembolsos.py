"""Pago de una reserva ya cancelada → reembolso automático, y cancelación que cierra el pago.

Bug que cubren: el jugador abría Stripe Checkout, cancelaba la reserva y luego
pagaba en la pestaña de Stripe que seguía abierta → se cobraba sin reserva.

Se usan dobles de prueba: un Supabase en memoria y un Stripe falso (no hay
llamadas reales a ningún servicio, por eso corre igual en GitHub Actions).
"""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
import stripe
from fastapi.testclient import TestClient

from app import deps
from app.config import get_settings
from app.deps import Usuario
from app.main import app
from app.routers import pagos as pagos_router
from app.routers import reservas as reservas_router
from app.servicios import correo, pagos

client = TestClient(app)

JUGADOR, OTRO, PROPIETARIO = "jug-1", "jug-2", "prop-1"
FECHA_LEJANA = (date.today() + timedelta(days=5)).isoformat()


# ---------------------------------------------------------------------------
# Doble de Supabase: imita la API encadenable de supabase-py sobre listas
# ---------------------------------------------------------------------------
class _Consulta:
    def __init__(self, db: "_SupabaseFalso", tabla: str):
        self.db, self.tabla = db, tabla
        self.filtros = []
        self.accion, self.valores, self.unico = "select", None, False
        self.conflicto, self.ignorar = None, False

    # filtros
    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filtros.append(lambda f: f.get(col) == val)
        return self

    def in_(self, col, vals):
        self.filtros.append(lambda f: f.get(col) in vals)
        return self

    def is_(self, col, val):
        self.filtros.append(lambda f: (f.get(col) is None) == (val == "null"))
        return self

    def lt(self, *_a):
        return self

    def maybe_single(self):
        self.unico = True
        return self

    # escrituras
    def update(self, valores):
        self.accion, self.valores = "update", valores
        return self

    def insert(self, valores):
        self.accion, self.valores = "insert", valores
        return self

    def upsert(self, valores, on_conflict=None, ignore_duplicates=False):
        self.accion, self.valores, self.conflicto, self.ignorar = "upsert", valores, on_conflict, ignore_duplicates
        return self

    def delete(self):
        self.accion = "delete"
        return self

    def execute(self):
        filas = self.db.tablas.setdefault(self.tabla, [])
        coinciden = [f for f in filas if all(c(f) for c in self.filtros)]
        if self.accion == "select":
            data = (coinciden[0] if coinciden else None) if self.unico else coinciden
        elif self.accion == "update":
            for f in coinciden:
                f.update(self.valores)
            data = coinciden
        elif self.accion == "insert":
            filas.append(dict(self.valores))
            data = [self.valores]
        elif self.accion == "upsert":
            # Igual que el UNIQUE de Postgres + ON CONFLICT DO NOTHING
            clave = self.valores[self.conflicto]
            if any(f.get(self.conflicto) == clave for f in filas):
                data = []
            else:
                filas.append(dict(self.valores))
                data = [self.valores]
        else:  # delete
            self.db.tablas[self.tabla] = [f for f in filas if f not in coinciden]
            data = coinciden
        return SimpleNamespace(data=data)


class _SupabaseFalso:
    def __init__(self, estado_reserva="pendiente_pago", hora_inicio="20:00:00", fecha=FECHA_LEJANA):
        self.tablas = {
            "reservas": [{
                "id": "res-1", "jugador_id": JUGADOR, "fecha": fecha, "hora_inicio": hora_inicio,
                "hora_fin": "21:00:00", "monto": 120, "estado": estado_reserva, "stripe_session_id": "cs_1",
                "cancha": {"nombre": "Misti", "tipo": "futbol7", "complejo": {
                    "nombre": "Yanahuara FC", "direccion": "Av. Ejército 710", "distrito": "Yanahuara",
                    "lat": -16.39, "lng": -71.54, "propietario_id": PROPIETARIO}},
            }],
            "pagos": [], "profiles": [{"id": JUGADOR, "nombre": "Katniss"}], "notificaciones_log": [],
        }
        email = SimpleNamespace(user=SimpleNamespace(email="katniss@canchaya.demo"))
        self.auth = SimpleNamespace(admin=SimpleNamespace(get_user_by_id=lambda _id: email))

    def table(self, nombre):
        return _Consulta(self, nombre)

    @property
    def reserva(self):
        return self.tablas["reservas"][0]


# ---------------------------------------------------------------------------
# Doble de Stripe
# ---------------------------------------------------------------------------
class _StripeFalso:
    def __init__(self, payment_status="unpaid", status="open"):
        self.sesion = SimpleNamespace(
            id="cs_1", payment_status=payment_status, status=status, amount_total=12000, currency="pen",
            payment_intent="pi_1", metadata={"reserva_id": "res-1", "jugador_id": JUGADOR},
            client_reference_id="res-1", url="https://checkout.stripe.com/x",
        )
        self.reembolsos, self.expiradas, self.correos = [], [], []

    def instalar(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_falsa")
        monkeypatch.setattr(stripe.checkout.Session, "retrieve", lambda _sid: self.sesion)
        monkeypatch.setattr(stripe.checkout.Session, "expire", self._expirar)
        monkeypatch.setattr(stripe.Refund, "create", self._reembolsar)
        monkeypatch.setattr(correo, "enviar_reembolso", lambda _sb, to, datos: self.correos.append((to, datos)) or "enviado")
        monkeypatch.setattr(correo, "enviar_confirmacion", lambda *_a: "enviado")
        return self

    def _expirar(self, sid):
        self.expiradas.append(sid)
        self.sesion.status = "expired"

    def _reembolsar(self, **kw):
        self.reembolsos.append(kw)
        return SimpleNamespace(id=f"re_{len(self.reembolsos)}")


@pytest.fixture(autouse=True)
def _limpiar_overrides():
    yield
    app.dependency_overrides.clear()


def _como(uid, aal="aal1", rol="jugador"):
    app.dependency_overrides[deps.get_usuario_actual] = lambda: Usuario(uid, "x@demo", rol, aal, "t")


# ---------------------------------------------------------------------------
# A) confirmar_pago: pago de una reserva cancelada → reembolso
# ---------------------------------------------------------------------------
def test_pago_de_reserva_cancelada_se_reembolsa(monkeypatch):
    sb = _SupabaseFalso(estado_reserva="cancelada")
    st = _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)

    r = pagos.confirmar_pago(sb, st.sesion)

    assert r["resultado"] == "reembolsada"
    assert r["monto_reembolsado"] == "S/ 120.00"
    assert sb.reserva["estado"] == "cancelada"  # NO se marca pagada
    assert len(st.reembolsos) == 1 and st.reembolsos[0]["payment_intent"] == "pi_1"
    assert st.reembolsos[0]["idempotency_key"] == "reembolso-cs_1"
    [pago] = sb.tablas["pagos"]
    assert pago["estado"] == "reembolsado" and pago["stripe_refund_id"] == "re_1"
    assert len(st.correos) == 1 and "S/ 120.00" == st.correos[0][1]["monto_reembolsado"]


def test_doble_llamada_reembolsa_una_sola_vez(monkeypatch):
    """Verificación (página de éxito) y webhook llegan para la misma sesión."""
    sb = _SupabaseFalso(estado_reserva="cancelada")
    st = _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)

    primera = pagos.confirmar_pago(sb, st.sesion)
    segunda = pagos.confirmar_pago(sb, st.sesion)

    assert primera["resultado"] == segunda["resultado"] == "reembolsada"
    assert len(st.reembolsos) == 1
    assert len(st.correos) == 1
    assert len(sb.tablas["pagos"]) == 1


def test_si_stripe_falla_el_reembolso_se_puede_reintentar(monkeypatch):
    sb = _SupabaseFalso(estado_reserva="cancelada")
    st = _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)

    def falla(**_kw):
        raise stripe.APIConnectionError("sin red")
    monkeypatch.setattr(stripe.Refund, "create", falla)
    with pytest.raises(Exception) as e:
        pagos.confirmar_pago(sb, st.sesion)
    assert getattr(e.value, "status_code", None) == 502
    assert sb.tablas["pagos"] == []  # se liberó el "reclamo"

    monkeypatch.setattr(stripe.Refund, "create", st._reembolsar)
    assert pagos.confirmar_pago(sb, st.sesion)["resultado"] == "reembolsada"
    assert len(st.reembolsos) == 1


def test_pago_normal_sigue_funcionando_y_no_reembolsa(monkeypatch):
    sb = _SupabaseFalso(estado_reserva="pendiente_pago")
    st = _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)

    assert pagos.confirmar_pago(sb, st.sesion)["resultado"] == "pagada"
    assert pagos.confirmar_pago(sb, st.sesion)["resultado"] == "pagada"  # idempotente
    assert sb.reserva["estado"] == "pagada"
    assert [p["estado"] for p in sb.tablas["pagos"]] == ["pagado"]
    assert st.reembolsos == []


def test_sesion_sin_pagar_devuelve_pendiente(monkeypatch):
    sb = _SupabaseFalso()
    st = _StripeFalso(payment_status="unpaid").instalar(monkeypatch)
    assert pagos.confirmar_pago(sb, st.sesion)["resultado"] == "pendiente"
    assert sb.reserva["estado"] == "pendiente_pago"


def test_verificar_devuelve_reembolsada(monkeypatch):
    sb = _SupabaseFalso(estado_reserva="cancelada")
    _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)
    monkeypatch.setattr(pagos_router, "get_supabase", lambda: sb)
    _como(JUGADOR)

    r = client.post("/pagos/verificar", json={"session_id": "cs_1"})
    assert r.status_code == 200 and r.json()["resultado"] == "reembolsada"


# ---------------------------------------------------------------------------
# B) POST /reservas/{id}/cancelar
# ---------------------------------------------------------------------------
def _cancelar(monkeypatch, sb):
    monkeypatch.setattr(reservas_router, "get_supabase", lambda: sb)
    return client.post("/reservas/res-1/cancelar")


def test_cancelar_expira_la_sesion_de_stripe(monkeypatch):
    sb = _SupabaseFalso()
    st = _StripeFalso(payment_status="unpaid", status="open").instalar(monkeypatch)
    _como(JUGADOR)

    r = _cancelar(monkeypatch, sb)

    assert r.status_code == 200 and r.json()["resultado"] == "cancelada"
    assert st.expiradas == ["cs_1"]
    assert sb.reserva["estado"] == "cancelada"


def test_propietario_con_mfa_cancela_y_expira(monkeypatch):
    sb = _SupabaseFalso()
    st = _StripeFalso().instalar(monkeypatch)
    _como(PROPIETARIO, aal="aal2", rol="propietario")
    assert _cancelar(monkeypatch, sb).status_code == 200
    assert st.expiradas == ["cs_1"] and sb.reserva["estado"] == "cancelada"


def test_propietario_sin_mfa_no_puede_cancelar(monkeypatch):
    sb = _SupabaseFalso()
    _StripeFalso().instalar(monkeypatch)
    _como(PROPIETARIO, aal="aal1", rol="propietario")
    assert _cancelar(monkeypatch, sb).status_code == 403
    assert sb.reserva["estado"] == "pendiente_pago"


def test_usuario_ajeno_no_puede_cancelar(monkeypatch):
    sb = _SupabaseFalso()
    st = _StripeFalso().instalar(monkeypatch)
    _como(OTRO)

    assert _cancelar(monkeypatch, sb).status_code == 403
    assert st.expiradas == []
    assert sb.reserva["estado"] == "pendiente_pago"


def test_jugador_no_cancela_a_menos_de_2_horas(monkeypatch):
    sb = _SupabaseFalso(fecha=date.today().isoformat(), hora_inicio="00:00:00")  # ya empezó
    st = _StripeFalso().instalar(monkeypatch)
    _como(JUGADOR)
    assert _cancelar(monkeypatch, sb).status_code == 409
    assert st.expiradas == [] and sb.reserva["estado"] == "pendiente_pago"


def test_cancelar_sesion_ya_pagada_confirma_en_vez_de_cancelar(monkeypatch):
    """El jugador pagó, pero el webhook aún no llegó cuando pulsa "Cancelar"."""
    sb = _SupabaseFalso()
    st = _StripeFalso(payment_status="paid", status="complete").instalar(monkeypatch)
    _como(JUGADOR)

    r = _cancelar(monkeypatch, sb)

    assert r.status_code == 200 and r.json()["resultado"] == "pagada"
    assert sb.reserva["estado"] == "pagada"
    assert st.expiradas == [] and st.reembolsos == []


def test_cancelar_sin_token_devuelve_401():
    assert client.post("/reservas/res-1/cancelar").status_code == 401
