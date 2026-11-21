"""Endpoints de prueba de autenticación.

- GET /me        → cualquier usuario logueado: devuelve id, email, rol y nivel AAL.
- GET /me/admin  → solo admin con MFA verificado (demuestra require_role + AAL2).
"""
from fastapi import APIRouter, Depends

from app.deps import Usuario, get_usuario_actual, require_role

router = APIRouter(prefix="/me", tags=["auth"])


@router.get("")
def quien_soy(usuario: Usuario = Depends(get_usuario_actual)) -> dict:
    return {"id": usuario.id, "email": usuario.email, "rol": usuario.rol, "aal": usuario.aal}


@router.get("/admin")
def solo_admin(usuario: Usuario = Depends(require_role("admin"))) -> dict:
    return {"mensaje": f"Hola {usuario.email}, tienes acceso de administrador con MFA."}
