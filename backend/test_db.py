import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine, text

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

database_url = URL.create(
    drivername="postgresql+psycopg",
    username=os.getenv("DATABASE_USER"),
    password=os.getenv("DATABASE_PASSWORD"),
    host=os.getenv("DATABASE_HOST", "localhost"),
    port=int(os.getenv("DATABASE_PORT", "5432")),
    database=os.getenv("DATABASE_NAME"),
)

# Comprobar que se hayan configurado los datos necesarios.
required = [
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_NAME",
]

missing = [key for key in required if not os.getenv(key)]

if missing:
    raise RuntimeError(
        "Faltan variables en el archivo .env: "
        + ", ".join(missing)
    )

engine = create_engine(database_url, pool_pre_ping=True)

try:
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT current_database(), current_user, version()")
        )
        database, user, version = result.one()

        print("¡Conexión exitosa!")
        print(f"Base de datos: {database}")
        print(f"Usuario: {user}")
        print(f"PostgreSQL: {version.split(',')[0]}")

except Exception as error:
    print("No se pudo conectar a PostgreSQL.")
    print(f"Tipo de error: {type(error).__name__}")
    print(f"Detalle: {error}")

finally:
    engine.dispose()