"""Configuración del backend leída desde variables de entorno (o del archivo .env).

pydantic-settings valida los tipos y permite que en Render solo configuremos
variables de entorno, sin tocar el código.
"""
import base64
import json
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Valor de relleno que trae backend/.env hasta que se pegue la llave real
PLACEHOLDER_SERVICE_ROLE = "PEGA_AQUI_LA_SB_SECRET"


def _rol_de_jwt(token: str) -> str | None:
    """Lee el claim "role" de una llave legacy (JWT) sin verificar la firma.

    Solo sirve para detectar el error típico de pegar la llave "anon" en lugar
    de la "service_role"; la verificación real la hace Supabase.
    """
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)  # base64url necesita padding
        return json.loads(base64.urlsafe_b64decode(payload)).get("role")
    except (IndexError, ValueError):
        return None


def validar_service_role_key(llave: str) -> None:
    """Comprueba que SUPABASE_SERVICE_ROLE_KEY sea una llave SECRETA de Supabase.

    Formatos aceptados:
    - Nuevo:  sb_secret_...            (Settings → API Keys → Secret keys)
    - Legacy: eyJ... (JWT con role=service_role)  (Settings → API Keys → Legacy)
    Lanza RuntimeError con un mensaje claro si la llave es pública o es el placeholder.
    Una llave vacía se permite (p. ej. en CI); los endpoints que usan Supabase responderán 503.
    """
    ayuda = (
        "Copia la llave secreta desde Supabase → Project Settings → API Keys "
        "(sb_secret_... o la legacy service_role eyJ...) y pégala en backend/.env."
    )
    if not llave:
        return
    if llave == PLACEHOLDER_SERVICE_ROLE:
        raise RuntimeError(f"SUPABASE_SERVICE_ROLE_KEY todavía tiene el placeholder '{PLACEHOLDER_SERVICE_ROLE}'. {ayuda}")
    if llave.startswith("sb_publishable_"):
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY tiene una llave PUBLICABLE (sb_publishable_...), que es la del "
            f"frontend y no salta RLS. El backend necesita la llave secreta. {ayuda}"
        )
    if llave.startswith("sb_secret_"):
        return
    if llave.startswith("eyJ"):
        rol = _rol_de_jwt(llave)
        if rol != "service_role":
            raise RuntimeError(
                f"SUPABASE_SERVICE_ROLE_KEY es un JWT legacy con role='{rol}', no 'service_role' "
                f"(probablemente pegaste la llave anon). {ayuda}"
            )
        return
    raise RuntimeError(f"SUPABASE_SERVICE_ROLE_KEY no tiene un formato reconocido. {ayuda}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Entorno: "development" o "production"
    environment: str = "development"

    # URL(s) del frontend permitidas por CORS. Se aceptan varias separadas por coma.
    frontend_url: str = "http://localhost:5173"

    # Supabase (la service role key NUNCA se expone al navegador)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Stripe (modo prueba)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    moneda: str = "pen"

    # Resend (correo)
    resend_api_key: str = ""
    email_from: str = "CanchaYa <onboarding@resend.dev>"

    # Secreto compartido para tareas programadas (pg_cron → backend)
    cron_secret: str = ""

    # Zona horaria del negocio
    timezone: str = "America/Lima"

    @property
    def cors_origins(self) -> list[str]:
        """Convierte FRONTEND_URL ("a,b,c") en lista para el middleware CORS."""
        return [o.strip().rstrip("/") for o in self.frontend_url.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Devuelve la configuración (se crea una sola vez y se reutiliza)."""
    return Settings()
