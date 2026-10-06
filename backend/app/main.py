from fastapi import FastAPI

app = FastAPI(
    title="Sistema de Gestión de Turnos",
    description="API para la gestión de clientes, turnos y atención en entidades de servicio.",
    version="0.1.0"
)


@app.get("/")
def inicio():
    return {
        "mensaje": "Sistema de Gestión de Turnos funcionando correctamente",
        "version": "0.1.0"
    }


@app.get("/health")
def health_check():
    return {
        "estado": "ok",
        "servicio": "backend"
    }