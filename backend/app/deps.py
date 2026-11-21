"""Dependencias compartidas de FastAPI: cliente Supabase y autenticación.

Flujo de autenticación:
1. El frontend inicia sesión con Supabase y obtiene un access_token (JWT).
2. Envía ese token en cada petición: `Authorization: Bearer <token>`.
3. Aquí lo validamos con `supabase.auth.get_user(token)` (Supabase verifica la firma y expiración).
4. Leemos el rol del usuario desde la tabla `profiles`.
"""
import base64
import json
from dataclasses import dataclass
from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.config import get_settings, validar_service_role_key

# auto_error=False para devolver nuestro propio mensaje 401 en español
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_supabase() -> Client:
    """Cliente Supabase con service role (salta RLS). Solo se usa en el backend."""
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Supabase no está configurado en el backend")
    # Acepta llaves nuevas (sb_secret_...) y legacy (eyJ... service_role); rechaza las públicas
    validar_service_role_key(s.supabase_service_role_key)
    return create_client(s.supabase_url, s.supabase_service_role_key)


@dataclass
class Usuario:
    """Usuario autenticado que reciben los endpoints protegidos."""
    id: str
    email: str | None
    rol: str
    aal: str  # "aal1" (solo contraseña) o "aal2" (contraseña + código TOTP)
    token: str


def leer_claims(token: str) -> dict:
    """Decodifica el payload del JWT SIN verificar la firma.

    Es seguro usarlo aquí porque antes `supabase.auth.get_user(token)` ya validó
    el token contra Supabase; solo necesitamos leer el claim "aal".
    """
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)  # base64url necesita padding
        return json.loads(base64.urlsafe_b64decode(payload))
    except (IndexError, ValueError):
        return {}


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

    aal = leer_claims(cred.credentials).get("aal", "aal1")
    return Usuario(id=user.id, email=user.email, rol=rol, aal=aal, token=cred.credentials)


# ---------------------------------------------------------------------------
# Autorización por rol y por nivel de autenticación (MFA)
# ---------------------------------------------------------------------------
# Roles que DEBEN tener MFA (según CLAUDE.md)
ROLES_CON_MFA = {"admin", "propietario"}


def require_role(*roles: str):
    """Dependencia que exige uno de los roles dados. Uso:

        @router.get("/admin/usuarios")
        def listar(u: Usuario = Depends(require_role("admin"))): ...

    Además, si el rol exige MFA (admin/propietario), exige sesión AAL2.
    """

    def verificar(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción")
        if usuario.rol in ROLES_CON_MFA and usuario.aal != "aal2":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere verificación en dos pasos (MFA)")
        return usuario

    return verificar


def require_aal2(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
    """Exige que la sesión se haya verificado con MFA (claim aal = 'aal2')."""
    if usuario.aal != "aal2":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere verificación en dos pasos (MFA)")
    return usuario
