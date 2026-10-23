
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Ruta de la carpeta raíz del proyecto: sistema-turnos/
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    # Configuración general
    app_name: str = "Sistema de Gestión de Turnos"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # Configuración de la base de datos PostgreSQL
    database_host: str = "localhost"
    database_port: int = 5432
    database_name: str = "sistema_turnos"
    database_user: str = "turnos_app"
    database_password: str = ""

    # Credenciales para el acceso a la consola de operadores
    operador_usuario: str = "operador"
    operador_clave: str = "CambiarEstaClave123!"

    # Configuración de seguridad de los tokens
    auth_secret: str = "cambiar-por-un-secreto-largo-y-aleatorio"
    auth_token_minutes: int = 480

    # Archivo de variables de entorno
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
