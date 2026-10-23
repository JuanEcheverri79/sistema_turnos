
"""evitar turnos activos duplicados por documento

Revision ID: efad4e9e9995
Revises: 84ca92b091ac
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "efad4e9e9995"
down_revision: Union[str, Sequence[str], None] = "84ca92b091ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONDICION_INDICE = sa.text(
    """
    estado IN ('en_espera', 'llamado', 'retenido')
    AND tipo_documento IS NOT NULL
    AND numero_documento IS NOT NULL
    """
)


def upgrade() -> None:
    op.create_index(
        "uq_turnos_documento_activo",
        "turnos",
        ["tipo_documento", "numero_documento"],
        unique=True,
        postgresql_where=CONDICION_INDICE,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_turnos_documento_activo",
        table_name="turnos",
        postgresql_where=CONDICION_INDICE,
    )
