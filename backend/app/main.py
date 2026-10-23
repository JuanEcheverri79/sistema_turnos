
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, get_db
from app.routers.auth import router as auth_router
from app.routers.turnos import router as turnos_router
from app.services.turnos import procesar_vencimientos_virtuales


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

INTERVALO_VENCIMIENTOS_SEGUNDOS = 60


def ejecutar_revision_vencimientos() -> int:
    """Abre una sesión, procesa vencimientos y la cierra."""

    generador_db = get_db()
    db = next(generador_db)

    try:
        return procesar_vencimientos_virtuales(db)
    finally:
        generador_db.close()


async def tarea_vencimientos() -> None:
    """Revisa periódicamente las reservas y congelaciones vencidas."""

    while True:
        try:
            procesados = await asyncio.to_thread(
                ejecutar_revision_vencimientos
            )

            if procesados:
                logger.info(
                    "Se procesaron %s turnos virtuales vencidos.",
                    procesados,
                )

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.exception(
                "Error al procesar vencimientos de turnos virtuales."
            )

        await asyncio.sleep(INTERVALO_VENCIMIENTOS_SEGUNDOS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tarea = asyncio.create_task(tarea_vencimientos())

    logger.info("Proceso automático de vencimientos iniciado.")

    try:
        yield
    finally:
        tarea.cancel()

        with suppress(asyncio.CancelledError):
            await tarea

        logger.info("Proceso automático de vencimientos detenido.")


app = FastAPI(
    title=settings.app_name,
    description=(
        "API para la gestión de clientes, turnos "
        "y atención en entidades de servicio."
    ),
    version=settings.app_version,
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Registrar las rutas de la API
app.include_router(auth_router)
app.include_router(turnos_router)


@app.get("/")
def inicio():
    return {
        "mensaje": (
            "Sistema de Gestión de Turnos "
            "funcionando correctamente"
        ),
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
