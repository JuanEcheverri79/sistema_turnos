from collections.abc import Generator

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


# Configuración de la conexión a PostgreSQL.
database_url = URL.create(
    drivername="postgresql+psycopg",
    username=settings.database_user,
    password=settings.database_password,
    host=settings.database_host,
    port=settings.database_port,
    database=settings.database_name,
)

# Motor compartido para las conexiones con PostgreSQL.
engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)


# Fábrica de sesiones para consultar y modificar la base de datos.
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


# Clase base para los futuros modelos de SQLAlchemy.
class Base(DeclarativeBase):
    pass


# Dependencia reutilizable para los endpoints de FastAPI.
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()