from fastapi import FastAPI

from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    description="API para la gestión de clientes, turnos y atención en entidades de servicio.",
    version=settings.app_version
)


@app.get("/")
def inicio():
    return {
        "mensaje": "Sistema de Gestión de Turnos funcionando correctamente",
        "version": settings.app_version
    }


@app.get("/health")
def health_check():
    return {
        "estado": "ok",
        "servicio": "backend",
        "entorno": settings.environment
    }