"""Rate limit básico con slowapi: máximo de peticiones por IP y por ruta.

Frena abusos simples (fuerza bruta, scripts que spamean el checkout) sin
infraestructura extra. El contador vive en memoria: con una sola instancia
(plan gratis de Render) es suficiente; con varias habría que usar Redis.
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# get_remote_address usa la IP del cliente. Detrás del proxy de Render la IP
# real llega en X-Forwarded-For: uvicorn la aplica con --proxy-headers (Dockerfile).
LIMITE_POR_DEFECTO = "100/minute"

limiter = Limiter(key_func=get_remote_address, default_limits=[LIMITE_POR_DEFECTO])


def demasiadas_peticiones(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Respuesta 429 en español."""
    return JSONResponse(
        status_code=429,
        content={"detail": f"Demasiadas peticiones ({exc.detail}). Espera un momento e inténtalo de nuevo."},
    )
