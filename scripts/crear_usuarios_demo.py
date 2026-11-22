"""Crea los usuarios demo de CanchaYa y los asocia a los datos del seed.

Uso (desde la raíz del repo, con el venv del backend):
    backend/.venv/bin/python scripts/crear_usuarios_demo.py

Lee SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DEMO_PASSWORD de backend/.env (o del entorno).
La contraseña de los usuarios demo NO se guarda en el repositorio.
Es idempotente: si un usuario ya existe, le restablece la contraseña y el rol.
"""
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))  # para reutilizar la validación de la llave

from app.config import validar_service_role_key  # noqa: E402
from supabase import create_client  # noqa: E402

USUARIOS = [
    # email, nombre, teléfono, rol
    ("admin@canchaya.demo", "Ana Admin", "999000001", "admin"),
    ("propietario1@canchaya.demo", "Pedro Propietario", "999000002", "propietario"),
    ("propietario2@canchaya.demo", "Paula Propietaria", "999000003", "propietario"),
    ("jugador@canchaya.demo", "Katniss Everdeen", "999000004", "jugador"),
    # Más jugadores demo (personajes de Los Juegos del Hambre, sin buzón real):
    # el seed reparte entre ellos las reservas de prueba para que la agenda
    # y los reportes muestren nombres variados.
    ("peeta@canchaya.demo", "Peeta Mellark", "999000010", "jugador"),
    ("gale@canchaya.demo", "Gale Hawthorne", "999000011", "jugador"),
    ("prim@canchaya.demo", "Primrose Everdeen", "999000012", "jugador"),
    ("haymitch@canchaya.demo", "Haymitch Abernathy", "999000013", "jugador"),
    ("effie@canchaya.demo", "Effie Trinket", "999000014", "jugador"),
    ("finnick@canchaya.demo", "Finnick Odair", "999000015", "jugador"),
    ("johanna@canchaya.demo", "Johanna Mason", "999000016", "jugador"),
    ("rue@canchaya.demo", "Rue", "999000017", "jugador"),
    ("beetee@canchaya.demo", "Beetee Latier", "999000018", "jugador"),
    # Jugador de la demo en vivo: correo real para recibir los correos de Resend
    # (sin dominio propio, Resend solo entrega al correo dueño de la cuenta).
    ("echipanar@ulasalle.edu.pe", "Evelyn Chipana", "999000005", "jugador"),
]


def leer_env(ruta: Path) -> dict[str, str]:
    """Lector mínimo de archivos .env (CLAVE=valor, ignora comentarios)."""
    valores: dict[str, str] = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                clave, valor = linea.split("=", 1)
                valores[clave.strip()] = valor.strip()
    return valores


def main() -> None:
    env = leer_env(RAIZ / "backend" / ".env")
    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL", "")
    llave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not llave:
        sys.exit("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env")
    # Contraseña de los usuarios demo: solo en backend/.env (que no se sube a git)
    PASSWORD = os.environ.get("DEMO_PASSWORD") or env.get("DEMO_PASSWORD", "")
    if not PASSWORD:
        sys.exit("Falta DEMO_PASSWORD en backend/.env (contraseña de los usuarios demo)")
    try:
        validar_service_role_key(llave)
    except RuntimeError as e:
        sys.exit(f"Error: {e}")

    sb = create_client(url, llave)

    # Usuarios ya existentes (la demo tiene pocos, basta la primera página)
    existentes = {u.email: u.id for u in sb.auth.admin.list_users(page=1, per_page=1000)}

    for email, nombre, telefono, rol in USUARIOS:
        datos = {"nombre": nombre, "telefono": telefono}
        if email in existentes:
            uid = existentes[email]
            sb.auth.admin.update_user_by_id(uid, {"password": PASSWORD, "user_metadata": datos})
            accion = "actualizado"
        else:
            # email_confirm=True: el usuario queda confirmado y puede entrar sin abrir el correo
            r = sb.auth.admin.create_user(
                {"email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": datos}
            )
            uid = r.user.id
            accion = "creado"

        # El trigger creó el perfil como 'jugador'; aquí (service role) se asigna el rol real
        sb.table("profiles").update({"nombre": nombre, "telefono": telefono, "rol": rol}).eq("id", uid).execute()
        print(f"  {accion:11} {email:30} rol={rol}")

    # Asigna complejos a los propietarios y genera reservas de ejemplo (función del seed.sql)
    resultado = sb.rpc("seed_asociar_demo").execute()
    print(f"\nseed_asociar_demo(): {resultado.data}")
    print(f"\nContraseña de todos los usuarios demo: {PASSWORD}")


if __name__ == "__main__":
    main()
