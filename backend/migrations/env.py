
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import URL

from app.core.config import settings
from app.core.database import Base
from app import models


# Configuración de Alembic
config = context.config

# Configuración de registros
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadatos de los modelos para generar migraciones automáticamente
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Ejecuta migraciones sin establecer una conexión directa."""

    database_url = URL.create(
        drivername="postgresql+psycopg",
        username=settings.database_user,
        password=settings.database_password,
        host=settings.database_host,
        port=settings.database_port,
        database=settings.database_name,
    )

    context.configure(
        url=database_url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Ejecuta migraciones con conexión directa a PostgreSQL."""

    database_url = URL.create(
        drivername="postgresql+psycopg",
        username=settings.database_user,
        password=settings.database_password,
        host=settings.database_host,
        port=settings.database_port,
        database=settings.database_name,
    )

    connectable = create_engine(
        database_url,
        poolclass=pool.NullPool,
    )

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()