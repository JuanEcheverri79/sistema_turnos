from fastapi import FastAPI
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

from app.routers.turnos import router as turnos_router

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.app_name,
    description=(
        "API para la gestión de clientes, turnos "
        "y atención en entidades de servicio."
    ),
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(turnos_router)

@app.get("/")
def inicio():
    return {
        "mensaje": "Sistema de Gestión de Turnos funcionando correctamente",
    }


@app.get("/health")
def health_check():
    return {
        "estado": "ok",
        "servicio": "backend",
        "entorno": settings.environment,
    }


@app.get("/health/database")
def health_database():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {
        "estado": "ok",
        "base_de_datos": settings.database_name,
        "conexion": "establecida",
    }