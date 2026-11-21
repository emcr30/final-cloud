"""Pruebas del panel admin sin tocar Supabase real."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app import deps
from app.deps import Usuario
from app.main import app
from app.routers.admin import _suspendido, crecimiento_semanal

client = TestClient(app)


def _como(rol, aal="aal2", uid="a1"):
    app.dependency_overrides[deps.get_usuario_actual] = lambda: Usuario(uid, "x@demo", rol, aal, "t")


def teardown_function():
    app.dependency_overrides.clear()


def test_admin_sin_token_401():
    assert client.get("/admin/usuarios").status_code == 401


def test_propietario_no_entra_al_admin():
    _como("propietario")
    assert client.get("/admin/usuarios").status_code == 403


def test_admin_sin_mfa_403():
    _como("admin", aal="aal1")
    r = client.get("/admin/resumen")
    assert r.status_code == 403 and "MFA" in r.json()["detail"]


def test_admin_no_se_quita_su_rol():
    _como("admin", uid="yo")
    assert client.patch("/admin/usuarios/yo/rol", json={"rol": "jugador"}).status_code == 400


def test_admin_no_se_suspende_a_si_mismo():
    _como("admin", uid="yo")
    assert client.post("/admin/usuarios/yo/suspension", json={"suspender": True}).status_code == 400


def test_rol_invalido_422():
    _como("admin")
    assert client.patch("/admin/usuarios/otro/rol", json={"rol": "superadmin"}).status_code == 422


def test_suspendido():
    futuro = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    pasado = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert _suspendido(futuro) and not _suspendido(pasado) and not _suspendido(None)


def test_crecimiento_semanal_acumula():
    ahora = datetime.now(timezone.utc)
    fechas = [(ahora - timedelta(weeks=w)).isoformat() for w in (0, 0, 1, 30)]
    datos = crecimiento_semanal(fechas, semanas=4)
    assert len(datos) == 4
    assert datos[-1]["nuevos"] == 2           # esta semana
    assert datos[-1]["total"] == 4            # incluye el usuario de hace 30 semanas
    assert datos[0]["total"] == 1             # al inicio solo estaba el antiguo
