"""Punto de entrada de la API de CanchaYa (FastAPI).

Ejecutar en local:  uvicorn app.main:app --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings, validar_service_role_key
from app.routers import health, me

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
    version="0.1.0",
)

# CORS: solo el frontend configurado en FRONTEND_URL puede llamar a la API desde el navegador
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (se agregan más en las siguientes partes: pagos, reportes, admin...)
app.include_router(health.router)
app.include_router(me.router)


@app.get("/", include_in_schema=False)
def raiz() -> dict:
    return {"mensaje": "CanchaYa API. Documentación en /docs"}
