"""add point_dataset_feature properties column

Revision ID: b1c9a3d7e5f2
Revises: 4f820683e072
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1c9a3d7e5f2'
down_revision: Union[str, Sequence[str], None] = '4f820683e072'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an open properties JSONB blob for extra columns from an uploaded CSV/Excel/GeoJSON file."""
    op.add_column(
        'point_dataset_feature',
        sa.Column('properties', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
    )


def downgrade() -> None:
    """Drop point_dataset_feature.properties."""
    op.drop_column('point_dataset_feature', 'properties')
