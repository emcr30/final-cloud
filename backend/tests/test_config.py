"""Pruebas de la validación de SUPABASE_SERVICE_ROLE_KEY."""
import base64
import json

import pytest

from app.config import PLACEHOLDER_SERVICE_ROLE, validar_service_role_key


def _jwt(rol: str) -> str:
    """Arma un JWT falso (firma inventada) con el rol indicado."""
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{b64({'alg': 'HS256'})}.{b64({'role': rol})}.firma"


@pytest.mark.parametrize("llave", ["", "sb_secret_abc123", _jwt("service_role")])
def test_acepta_llaves_secretas(llave):
    validar_service_role_key(llave)  # no debe lanzar


@pytest.mark.parametrize(
    "llave, mensaje",
    [
        (PLACEHOLDER_SERVICE_ROLE, "placeholder"),
        ("sb_publishable_abc123", "PUBLICABLE"),
        (_jwt("anon"), "anon"),
        ("cualquier-cosa", "formato"),
    ],
)
def test_rechaza_llaves_publicas_o_placeholder(llave, mensaje):
    with pytest.raises(RuntimeError, match=mensaje):
        validar_service_role_key(llave)
