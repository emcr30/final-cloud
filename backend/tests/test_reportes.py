"""Pruebas de reportes: autorización, aislamiento por propietario y generación de archivos.

Se usa un Supabase "falso" en memoria para no depender de la base real.
"""
from fastapi.testclient import TestClient

from app import deps
from app.deps import Usuario
from app.main import app
from app.routers import reportes
from app.servicios.reportes import generar_pdf, resumen

client = TestClient(app)


class _Consulta:
    """Imita la API encadenable de supabase-py (select/eq/in_/... → execute)."""

    def __init__(self, filas):
        self.filas = list(filas)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filas = [f for f in self.filas if f.get(col) == val]
        return self

    def in_(self, col, vals):
        self.filas = [f for f in self.filas if f.get(col) in vals]
        return self

    def gte(self, *_a):
        return self

    def lte(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        self.filas = self.filas[a:b + 1]
        return self

    def execute(self):
        return type("R", (), {"data": self.filas})()


class _SupabaseFalso:
    def __init__(self):
        self.tablas = {
            "complejos": [
                {"id": "c1", "nombre": "Complejo de P1", "propietario_id": "p1"},
                {"id": "c2", "nombre": "Complejo de P2", "propietario_id": "p2"},
            ],
            "canchas": [
                {"id": "k1", "nombre": "Misti", "complejo_id": "c1"},
                {"id": "k2", "nombre": "Chachani", "complejo_id": "c2"},
            ],
            "reservas": [
                {"fecha": "2026-11-20", "hora_inicio": "19:00:00", "hora_fin": "20:00:00", "estado": "pagada",
                 "monto": 100, "es_bloqueo": False, "cancha_id": "k1", "jugador": {"nombre": "Juan"}},
                {"fecha": "2026-11-20", "hora_inicio": "20:00:00", "hora_fin": "21:00:00", "estado": "pagada",
                 "monto": 0, "es_bloqueo": True, "cancha_id": "k1", "jugador": {"nombre": "Pedro"}},
                {"fecha": "2026-11-20", "hora_inicio": "19:00:00", "hora_fin": "20:00:00", "estado": "pagada",
                 "monto": 999, "es_bloqueo": False, "cancha_id": "k2", "jugador": {"nombre": "Ana"}},
            ],
        }

    def table(self, nombre):
        return _Consulta(self.tablas[nombre])


def _como(rol, uid):
    """Sustituye la autenticación y Supabase por dobles de prueba."""
    app.dependency_overrides[deps.get_usuario_actual] = lambda: Usuario(uid, "x@demo", rol, "aal2", "t")
    reportes.get_supabase = lambda: _SupabaseFalso()


def teardown_function():
    app.dependency_overrides.clear()


URL = "/reportes/export?desde=2026-11-01&hasta=2026-11-30"


def test_export_sin_token_401():
    assert client.get(URL).status_code == 401


def test_export_jugador_403():
    _como("jugador", "j1")
    assert client.get(URL).status_code == 403


def test_propietario_solo_ve_sus_reservas():
    _como("propietario", "p1")
    r = client.get(URL + "&formato=csv")
    assert r.status_code == 200
    texto = r.content.decode("utf-8-sig")
    assert "Complejo de P1" in texto
    assert "Complejo de P2" not in texto  # aislamiento multi-tenant
    assert "Bloqueo" in texto


def test_propietario_no_pide_complejo_ajeno():
    _como("propietario", "p1")
    assert client.get(URL + "&complejo_id=c2").status_code == 404


def test_admin_ve_todo_en_pdf():
    _como("admin", "a1")
    r = client.get(URL + "&formato=pdf")
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


def test_rango_invertido_400():
    _como("propietario", "p1")
    assert client.get("/reportes/export?desde=2026-11-30&hasta=2026-11-01").status_code == 400


def test_resumen_no_cuenta_bloqueos_como_ingreso():
    filas = [
        {"tipo": "Reserva", "estado": "Pagada", "monto": "100.00"},
        {"tipo": "Bloqueo", "estado": "Pagada", "monto": "0.00"},
        {"tipo": "Reserva", "estado": "Cancelada", "monto": "50.00"},
    ]
    r = resumen(filas)
    assert r["validas"] == 1 and r["ingresos"] == 100 and r["canceladas"] == 1


def test_pdf_vacio_se_genera():
    from datetime import date
    assert generar_pdf([], "Prueba", date(2026, 11, 1), date(2026, 11, 2)).startswith(b"%PDF")
