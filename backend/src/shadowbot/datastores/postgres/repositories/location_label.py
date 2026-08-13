from datetime import UTC, datetime
from uuid import uuid4

from shapely.geometry import shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.location_label import LocationLabelTable
from shadowbot.datastores.postgres.utils import geom_to_point, point_to_geom
from shadowbot.schemas.location_label import LocationLabel, LocationLabelCreate

# Good enough for a single-region prototype without a projected-CRS round trip — matches
# the same tradeoff PostgresPointDatasetRepository.find_along_route makes for its own buffer.
_METERS_PER_DEGREE = 111_320
_MERGE_RADIUS_M = 250


class PostgresLocationLabelRepository:
    """Postgres implementation of LocationLabelRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_location_label(self, label: LocationLabelCreate) -> LocationLabel:
        """Create a new location label, or update one already saved within _MERGE_RADIUS_M."""
        point = shape(label.geometry.model_dump(mode="json"))
        existing = (await self.session.execute(select(LocationLabelTable))).scalars().all()
        match = next(
            (
                row
                for row in existing
                if point.distance(shape(geom_to_point(row.geom).model_dump(mode="json"))) * _METERS_PER_DEGREE
                <= _MERGE_RADIUS_M
            ),
            None,
        )
        if match is not None:
            match.category = label.category
            match.name = label.name
        else:
            match = LocationLabelTable(
                id=str(uuid4()),
                geom=point_to_geom(label.geometry),
                category=label.category,
                name=label.name,
                date_created=datetime.now(UTC),
            )
            self.session.add(match)
        await self.session.commit()
        return LocationLabel(
            id=match.id,
            geometry=geom_to_point(match.geom),
            category=match.category,
            name=match.name,
            date_created=match.date_created,
        )

    async def get_location_labels(self) -> list[LocationLabel]:
        """List all saved location labels."""
        rows = (await self.session.execute(select(LocationLabelTable))).scalars().all()
        return [
            LocationLabel(
                id=row.id,
                geometry=geom_to_point(row.geom),
                category=row.category,
                name=row.name,
                date_created=row.date_created,
            )
            for row in rows
        ]
