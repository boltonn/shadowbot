"""collapse route extra columns

Revision ID: a735df44d400
Revises: 06e91ca80a2a
Create Date: 2026-08-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a735df44d400'
down_revision: Union[str, Sequence[str], None] = '06e91ca80a2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Fold route.avoid into a single route.extra JSONB blob alongside waypoints/network_type/legs/alternates.

    Those fields are nested and never queried structurally by Postgres, so keeping them as one
    blob means adding a field to the Route schema no longer requires a migration + hand-written
    column mapping (see the waypoints/network_type fields that were silently dropped before this).
    """
    op.add_column('route', sa.Column('extra', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.execute(
        """
        UPDATE route
        SET extra = jsonb_build_object(
            'avoid', avoid,
            'waypoints', '[]'::jsonb,
            'networkType', 'drive',
            'legs', '[]'::jsonb,
            'alternates', '[]'::jsonb
        )
        """
    )
    op.alter_column('route', 'extra', nullable=False)
    op.drop_column('route', 'avoid')


def downgrade() -> None:
    """Restore route.avoid from route.extra, drop route.extra."""
    op.add_column('route', sa.Column('avoid', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.execute("UPDATE route SET avoid = extra -> 'avoid'")
    op.alter_column('route', 'avoid', nullable=False)
    op.drop_column('route', 'extra')
