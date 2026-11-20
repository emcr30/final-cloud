"""Dependencias compartidas de FastAPI: cliente Supabase y autenticación.

Flujo de autenticación:
1. El frontend inicia sesión con Supabase y obtiene un access_token (JWT).
2. Envía ese token en cada petición: `Authorization: Bearer <token>`.
3. Aquí lo validamos con `supabase.auth.get_user(token)` (Supabase verifica la firma y expiración).
4. Leemos el rol del usuario desde la tabla `profiles`.
"""
from dataclasses import dataclass
from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.config import get_settings

# auto_error=False para devolver nuestro propio mensaje 401 en español
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_supabase() -> Client:
    """Cliente Supabase con service role (salta RLS). Solo se usa en el backend."""
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Supabase no está configurado en el backend")
    return create_client(s.supabase_url, s.supabase_service_role_key)


@dataclass
class Usuario:
    """Usuario autenticado que reciben los endpoints protegidos."""
    id: str
    email: str | None
    rol: str
    token: str


def get_usuario_actual(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Usuario:
    """Valida el token de Supabase y devuelve el usuario con su rol. 401 si no es válido."""
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de autenticación")

    sb = get_supabase()
    try:
        respuesta = sb.auth.get_user(cred.credentials)
        user = respuesta.user if respuesta else None
    except Exception:
        user = None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")

    # El rol vive en profiles (no en el JWT) para que el admin pueda cambiarlo
    perfil = sb.table("profiles").select("rol").eq("id", user.id).maybe_single().execute()
    rol = perfil.data["rol"] if perfil and perfil.data else "jugador"

    return Usuario(id=user.id, email=user.email, rol=rol, token=cred.credentials)
