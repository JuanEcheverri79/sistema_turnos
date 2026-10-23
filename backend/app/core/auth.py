"""Autenticación ligera por token firmado para operadores de la consola.

Configurar OPERADOR_USUARIO, OPERADOR_CLAVE y AUTH_SECRET en .env.
En producción, usar un secreto largo y exclusivo.
"""
import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def crear_token(usuario: str) -> str:
    ahora = int(time.time())
    carga = {"sub": usuario, "iat": ahora, "exp": ahora + settings.auth_token_minutes * 60}
    cuerpo = _b64(json.dumps(carga, separators=(",", ":")).encode())
    firma = _b64(hmac.new(settings.auth_secret.encode(), cuerpo.encode(), hashlib.sha256).digest())
    return f"{cuerpo}.{firma}"


def validar_token(token: str) -> dict | None:
    try:
        cuerpo, firma = token.split(".", 1)
        firma_esperada = _b64(hmac.new(settings.auth_secret.encode(), cuerpo.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(firma, firma_esperada):
            return None
        carga = json.loads(base64.urlsafe_b64decode(cuerpo + "=" * (-len(cuerpo) % 4)))
        if int(carga.get("exp", 0)) < int(time.time()):
            return None
        return carga
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def requerir_operador(credenciales: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credenciales is None:
        raise HTTPException(status_code=401, detail="Debes iniciar sesión para usar la consola.")
    carga = validar_token(credenciales.credentials)
    if not carga or carga.get("sub") != settings.operador_usuario:
        raise HTTPException(status_code=401, detail="La sesión no es válida o ha vencido.")
    return carga
