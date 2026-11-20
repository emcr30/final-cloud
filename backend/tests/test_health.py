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
