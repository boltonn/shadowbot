from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.track import TrackPointTable, TrackTable
from shadowbot.datastores.postgres.utils import flatten_distinct_tags, geom_to_point, point_to_geom
from shadowbot.schemas.common import SortOrder
from shadowbot.schemas.dataset import BulkTagRequest, LabelTrackPointRequest
from shadowbot.schemas.track import (
    PaginatedTracksResponse,
    Track,
    TrackCreate,
    TrackDetail,
    TrackPoint,
    TracksRequest,
)


class PostgresTrackRepository:
    """Postgres implementation of TrackRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_track(self, track: TrackCreate) -> Track:
        """Persist a new track and its points in one transaction."""
        track_table = TrackTable(
            id=str(uuid4()),
            name=track.name,
            source=track.source,
            date_created=datetime.now(UTC),
        )
        track_table.points = [
            TrackPointTable(
                id=str(uuid4()),
                track_id=track_table.id,
                geom=point_to_geom(point.geometry),
                date_recorded=point.date_recorded,
                elevation_m=point.elevation_m,
                speed_mps=point.speed_mps,
                tags=point.tags,
            )
            for point in track.points
        ]
        self.session.add(track_table)
        await self.session.commit()
        return await self._summarize(track_table.id)

    async def get_track_by_id(self, track_id: str) -> TrackDetail | None:
        """Retrieve a track's metadata and full ordered point history."""
        result = await self.session.execute(select(TrackTable).where(TrackTable.id == track_id))
        track_table = result.scalar_one_or_none()
        if track_table is None:
            return None

        points_result = await self.session.execute(
            select(TrackPointTable)
            .where(TrackPointTable.track_id == track_id)
            .order_by(TrackPointTable.date_recorded)
        )
        points = [
            TrackPoint(
                id=p.id,
                track_id=p.track_id,
                geometry=geom_to_point(p.geom),
                date_recorded=p.date_recorded,
                elevation_m=p.elevation_m,
                speed_mps=p.speed_mps,
                tags=p.tags,
            )
            for p in points_result.scalars().all()
        ]
        summary = await self._summarize(track_id)
        return TrackDetail(**summary.model_dump(), points=points)

    async def get_tracks(self, request: TracksRequest) -> PaginatedTracksResponse:
        """List track summaries, each enriched with point_count/date_start/date_end."""
        stats = (
            select(
                TrackPointTable.track_id.label("track_id"),
                func.count(TrackPointTable.id).label("point_count"),
                func.min(TrackPointTable.date_recorded).label("date_start"),
                func.max(TrackPointTable.date_recorded).label("date_end"),
                func.array_agg(TrackPointTable.tags)
                .filter(func.cardinality(TrackPointTable.tags) > 0)
                .label("tags"),
            )
            .group_by(TrackPointTable.track_id)
            .subquery()
        )

        total_count = (await self.session.execute(select(func.count(TrackTable.id)))).scalar_one()

        order_column = TrackTable.date_created
        data_stmt = (
            select(TrackTable, stats.c.point_count, stats.c.date_start, stats.c.date_end, stats.c.tags)
            .outerjoin(stats, TrackTable.id == stats.c.track_id)
            .order_by(order_column.desc() if request.sort_order == SortOrder.DESC else order_column.asc())
            .offset((request.page - 1) * request.limit)
            .limit(request.limit)
        )
        data_result = await self.session.execute(data_stmt)
        tracks = [
            Track(
                id=t.id,
                name=t.name,
                source=t.source,
                point_count=point_count or 0,
                tags=flatten_distinct_tags(tags),
                date_created=t.date_created,
                date_start=date_start,
                date_end=date_end,
            )
            for t, point_count, date_start, date_end, tags in data_result.all()
        ]

        total_pages = (total_count + request.limit - 1) // request.limit
        return PaginatedTracksResponse(
            total=total_count, page=request.page, limit=request.limit, total_pages=total_pages, data=tracks
        )

    async def label_feature(self, track_id: str, point_id: str, request: LabelTrackPointRequest) -> TrackPoint:
        """Update a track point's tags."""
        point = (
            await self.session.execute(
                select(TrackPointTable).where(TrackPointTable.id == point_id, TrackPointTable.track_id == track_id)
            )
        ).scalar_one()
        point.tags = request.tags
        await self.session.commit()
        return TrackPoint(
            id=point.id,
            track_id=point.track_id,
            geometry=geom_to_point(point.geom),
            date_recorded=point.date_recorded,
            elevation_m=point.elevation_m,
            speed_mps=point.speed_mps,
            tags=point.tags,
        )

    async def bulk_tag_features(self, track_id: str, request: BulkTagRequest) -> list[TrackPoint]:
        """Apply and/or remove tags across a set of this track's points."""
        points_result = await self.session.execute(
            select(TrackPointTable).where(
                TrackPointTable.track_id == track_id, TrackPointTable.id.in_(request.feature_ids)
            )
        )
        points = list(points_result.scalars().all())
        for point in points:
            point.tags = sorted((set(point.tags) | set(request.add_tags)) - set(request.remove_tags))
        await self.session.commit()
        return [
            TrackPoint(
                id=p.id,
                track_id=p.track_id,
                geometry=geom_to_point(p.geom),
                date_recorded=p.date_recorded,
                elevation_m=p.elevation_m,
                speed_mps=p.speed_mps,
                tags=p.tags,
            )
            for p in points
        ]

    async def _summarize(self, track_id: str) -> Track:
        track_table = (
            await self.session.execute(select(TrackTable).where(TrackTable.id == track_id))
        ).scalar_one()
        point_count, date_start, date_end, tags = (
            await self.session.execute(
                select(
                    func.count(TrackPointTable.id),
                    func.min(TrackPointTable.date_recorded),
                    func.max(TrackPointTable.date_recorded),
                    func.array_agg(TrackPointTable.tags).filter(func.cardinality(TrackPointTable.tags) > 0),
                ).where(TrackPointTable.track_id == track_id)
            )
        ).one()
        return Track(
            id=track_table.id,
            name=track_table.name,
            source=track_table.source,
            point_count=point_count or 0,
            tags=flatten_distinct_tags(tags),
            date_created=track_table.date_created,
            date_start=date_start,
            date_end=date_end,
        )
