"""Configuración del backend leída desde variables de entorno (o del archivo .env).

pydantic-settings valida los tipos y permite que en Render solo configuremos
variables de entorno, sin tocar el código.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
