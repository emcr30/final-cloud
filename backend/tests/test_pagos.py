"""Pruebas de pagos y tareas que no necesitan Stripe ni Supabase reales."""
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.servicios.correo import fecha_larga, html_confirmacion
from app.servicios.pagos import a_centavos

client = TestClient(app)


def test_checkout_sin_token_devuelve_401():
    assert client.post("/pagos/checkout", json={"reserva_id": "x"}).status_code == 401


def test_verificar_sin_token_devuelve_401():
    assert client.post("/pagos/verificar", json={"session_id": "cs_test_x"}).status_code == 401


def test_webhook_sin_secreto_configurado_devuelve_503(monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "")
    assert client.post("/pagos/webhook", content=b"{}").status_code == 503


def test_webhook_con_firma_falsa_devuelve_400(monkeypatch):
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_prueba")
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_prueba")
    r = client.post("/pagos/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=falsa"})
    assert r.status_code == 400


@pytest.mark.parametrize("header", [None, "secreto-incorrecto"])
def test_limpiar_pendientes_exige_cron_secret(monkeypatch, header):
    monkeypatch.setattr(get_settings(), "cron_secret", "el-secreto-real")
    headers = {"X-Cron-Secret": header} if header else {}
    assert client.post("/tareas/limpiar-pendientes", headers=headers).status_code == 401


def test_a_centavos():
    assert a_centavos(120) == 12000
    assert a_centavos("85.50") == 8550
    assert a_centavos(0.1 + 0.2) == 30  # sin errores de redondeo de coma flotante


def test_fecha_larga_en_espanol():
    assert fecha_larga("2026-11-22") == "domingo 22 de noviembre de 2026"


def test_correo_escapa_html():
    datos = {
        "reserva_id": "r1", "complejo": "<script>x</script>", "cancha": "Misti", "fecha_larga": "hoy",
        "hora_inicio": "20:00", "hora_fin": "21:00", "direccion": "Av. Ejército 710", "distrito": "Yanahuara",
        "monto": "S/ 120.00", "nombre": "Evelyn", "lat": -16.39, "lng": -71.54,
    }
    html = html_confirmacion(datos)
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "S/ 120.00" in html and "google.com/maps?q=-16.39,-71.54" in html
