"""add location_label table

Revision ID: 4f820683e072
Revises: d84817b784c9
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f820683e072'
down_revision: Union[str, Sequence[str], None] = 'd84817b784c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('location_label',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('geom', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, dimension=2, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('category', sa.String(length=100), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.Column('date_created', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_location_label_category'), 'location_label', ['category'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_location_label_category'), table_name='location_label')
    op.drop_table('location_label')
