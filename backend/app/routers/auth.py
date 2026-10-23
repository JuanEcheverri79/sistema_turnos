
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.auth import crear_token
from app.core.config import settings


router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"],
)


class LoginRequest(BaseModel):
    usuario: str
    clave: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: str


@router.post("/login", response_model=LoginResponse)
def iniciar_sesion(datos: LoginRequest):
    usuario_correcto = datos.usuario == settings.operador_usuario
    clave_correcta = datos.clave == settings.operador_clave

    if not usuario_correcto or not clave_correcta:
        raise HTTPException(
            status_code=401,
            detail="Usuario o contraseña incorrectos.",
        )

    token = crear_token(datos.usuario)

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        usuario=datos.usuario,
    )
