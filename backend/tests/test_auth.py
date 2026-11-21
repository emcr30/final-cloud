"""Pruebas de autenticación/autorización sin depender de Supabase real."""
import base64
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.deps import Usuario, leer_claims, require_aal2, require_role
from app.main import app

client = TestClient(app)


def _jwt(payload: dict) -> str:
    """Arma un JWT falso (sin firma válida) solo para probar la lectura de claims."""
    cuerpo = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{cuerpo}.firma"


def _usuario(rol: str, aal: str) -> Usuario:
    return Usuario(id="u1", email="x@canchaya.demo", rol=rol, aal=aal, token="t")


def test_me_sin_token_devuelve_401():
    r = client.get("/me")
    assert r.status_code == 401


def test_leer_claims_aal():
    assert leer_claims(_jwt({"aal": "aal2"}))["aal"] == "aal2"
    assert leer_claims("no-es-un-jwt") == {}


def test_require_role_rechaza_rol_incorrecto():
    with pytest.raises(HTTPException) as e:
        require_role("admin")(_usuario("jugador", "aal1"))
    assert e.value.status_code == 403


def test_require_role_exige_mfa_a_admin():
    with pytest.raises(HTTPException):
        require_role("admin")(_usuario("admin", "aal1"))
    assert require_role("admin")(_usuario("admin", "aal2")).rol == "admin"


def test_jugador_no_necesita_mfa():
    assert require_role("jugador")(_usuario("jugador", "aal1")).rol == "jugador"


def test_require_aal2():
    with pytest.raises(HTTPException):
        require_aal2(_usuario("jugador", "aal1"))
    assert require_aal2(_usuario("jugador", "aal2")).aal == "aal2"
