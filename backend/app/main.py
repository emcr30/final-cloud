"""Punto de entrada de la API de CanchaYa (FastAPI).

Ejecutar en local:  uvicorn app.main:app --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings, validar_service_role_key
from app.limites import demasiadas_peticiones, limiter
from app.routers import admin, health, me, pagos, reportes, reservas, tareas

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Al arrancar: si la llave de Supabase es incorrecta, el servidor se detiene con un mensaje claro."""
    validar_service_role_key(settings.supabase_service_role_key)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="CanchaYa API",
    description="Backend de CanchaYa: pagos (Stripe), correos (Resend), reportes y administración.",
    version="1.0.0",
)

# Rate limit: 100 peticiones por minuto por IP y por ruta (429 si se pasa). /health está exento.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, demasiadas_peticiones)
app.add_middleware(SlowAPIMiddleware)

# CORS: solo el frontend configurado en FRONTEND_URL puede llamar a la API desde el navegador,
# y solo con los métodos y cabeceras que usa la app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # la sesión va en el header Authorization, no en cookies
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routers
app.include_router(health.router)
app.include_router(me.router)
app.include_router(pagos.router)
app.include_router(reservas.router)
app.include_router(tareas.router)
app.include_router(reportes.router)
app.include_router(admin.router)


@app.get("/", include_in_schema=False)
def raiz() -> dict:
    return {"mensaje": "CanchaYa API. Documentación en /docs"}
