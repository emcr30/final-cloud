"""Pruebas básicas del endpoint /health."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_responde_ok():
    r = client.get("/health")
    assert r.status_code == 200
    datos = r.json()
    assert datos["estado"] == "ok"
    assert "hora" in datos


def test_health_servicios_no_expone_secretos():
    r = client.get("/health/servicios")
    assert r.status_code == 200
    datos = r.json()
    assert set(datos) == {"supabase", "stripe", "stripe_webhook", "resend", "cron_secret"}
    assert all(isinstance(v, bool) for v in datos.values())  # solo sí/no, nunca la llave


def test_rate_limit_devuelve_429():
    # /me sin token responde 401, pero cada intento cuenta: el 101.º en un minuto es 429
    codigos = {client.get("/me").status_code for _ in range(101)}
    assert 429 in codigos


def test_health_no_tiene_rate_limit():
    assert all(client.get("/health").status_code == 200 for _ in range(110))


def test_cors_solo_frontend_configurado():
    r = client.options("/health", headers={"Origin": "https://sitio-malicioso.com", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in r.headers
