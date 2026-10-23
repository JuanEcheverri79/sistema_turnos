
"""agregar soporte para turnos virtuales

Revision ID: 175b98f72821
Revises: efad4e9e9995
Create Date: 2026-10-21 18:57:01.643787
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Identificadores de Alembic.
revision: str = "175b98f72821"
down_revision: Union[str, Sequence[str], None] = "efad4e9e9995"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDICE_DOCUMENTO_ACTIVO = "uq_turnos_documento_activo"


def upgrade() -> None:
    """Agregar campos para gestionar turnos virtuales."""

    # Datos de contacto. Es nullable para conservar los turnos existentes.
    op.add_column(
        "turnos",
        sa.Column(
            "celular",
            sa.String(length=20),
            nullable=True,
        ),
    )

    # Momento en el que se congela un turno virtual.
    op.add_column(
        "turnos",
        sa.Column(
            "congelado_en",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Incluir las reservas y los turnos congelados en la protección
    # que impide tener varios turnos activos para el mismo documento.
    op.drop_index(
        INDICE_DOCUMENTO_ACTIVO,
        table_name="turnos",
    )

    op.create_index(
        INDICE_DOCUMENTO_ACTIVO,
        "turnos",
        ["tipo_documento", "numero_documento"],
        unique=True,
        postgresql_where=sa.text(
            """
            estado IN (
                'reservado',
                'en_espera',
                'llamado',
                'retenido',
                'congelado'
            )
            AND tipo_documento IS NOT NULL
            AND numero_documento IS NOT NULL
            """
        ),
    )


def downgrade() -> None:
    """Revertir los cambios de esta migración."""

    op.drop_index(
        INDICE_DOCUMENTO_ACTIVO,
        table_name="turnos",
    )

    # Restaurar la condición original del índice.
    op.create_index(
        INDICE_DOCUMENTO_ACTIVO,
        "turnos",
        ["tipo_documento", "numero_documento"],
        unique=True,
        postgresql_where=sa.text(
            """
            estado IN ('en_espera', 'llamado', 'retenido')
            AND tipo_documento IS NOT NULL
            AND numero_documento IS NOT NULL
            """
        ),
    )

    op.drop_column("turnos", "congelado_en")
    op.drop_column("turnos", "celular")
