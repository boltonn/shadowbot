from sqlalchemy import ARRAY, DateTime, String, cast, distinct, func, literal, null, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.repositories.point_dataset import PostgresPointDatasetRepository
from shadowbot.datastores.postgres.repositories.polygon_dataset import PostgresPolygonDatasetRepository
from shadowbot.datastores.postgres.repositories.track import PostgresTrackRepository
from shadowbot.datastores.postgres.tables.point_dataset import PointDatasetFeatureTable, PointDatasetTable
from shadowbot.datastores.postgres.tables.polygon_dataset import PolygonDatasetFeatureTable, PolygonDatasetTable
from shadowbot.datastores.postgres.tables.track import TrackPointTable, TrackTable
from shadowbot.schemas.common import DatasetGeometryKind, SortOrder
from shadowbot.schemas.dataset import Dataset, DatasetDetail, DatasetsRequest, PaginatedDatasetsResponse
from shadowbot.schemas.point_dataset import PointDatasetDetail
from shadowbot.schemas.track import TrackDetail


class PostgresDatasetRepository:
    """Facade over the point/track/polygon repositories for the unified dataset browsing surface."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.points = PostgresPointDatasetRepository(session=session)
        self.tracks = PostgresTrackRepository(session=session)
        self.polygons = PostgresPolygonDatasetRepository(session=session)

    async def list_datasets(self, request: DatasetsRequest) -> PaginatedDatasetsResponse:
        """List dataset summaries across all geometry kinds, newest first by default."""
        point_stats = (
            select(
                PointDatasetFeatureTable.dataset_id.label("dataset_id"),
                func.count(PointDatasetFeatureTable.id).label("feature_count"),
                func.array_agg(distinct(PointDatasetFeatureTable.category)).label("categories"),
                func.array_agg(PointDatasetFeatureTable.tags)
                .filter(func.cardinality(PointDatasetFeatureTable.tags) > 0)
                .label("tags"),
            )
            .group_by(PointDatasetFeatureTable.dataset_id)
            .subquery()
        )
        point_branch = select(
            PointDatasetTable.id.label("id"),
            PointDatasetTable.name.label("name"),
            literal(DatasetGeometryKind.POINT.value).label("geometry_kind"),
            func.coalesce(point_stats.c.feature_count, 0).label("feature_count"),
            point_stats.c.categories.label("categories"),
            point_stats.c.tags.label("tags"),
            PointDatasetTable.date_created.label("date_created"),
            cast(null(), DateTime(timezone=True)).label("date_start"),
            cast(null(), DateTime(timezone=True)).label("date_end"),
        ).outerjoin(point_stats, PointDatasetTable.id == point_stats.c.dataset_id)

        track_stats = (
            select(
                TrackPointTable.track_id.label("track_id"),
                func.count(TrackPointTable.id).label("feature_count"),
                func.min(TrackPointTable.date_recorded).label("date_start"),
                func.max(TrackPointTable.date_recorded).label("date_end"),
                func.array_agg(TrackPointTable.tags)
                .filter(func.cardinality(TrackPointTable.tags) > 0)
                .label("tags"),
            )
            .group_by(TrackPointTable.track_id)
            .subquery()
        )
        track_branch = select(
            TrackTable.id.label("id"),
            TrackTable.name.label("name"),
            literal(DatasetGeometryKind.TRACK.value).label("geometry_kind"),
            func.coalesce(track_stats.c.feature_count, 0).label("feature_count"),
            cast(null(), ARRAY(String)).label("categories"),
            track_stats.c.tags.label("tags"),
            TrackTable.date_created.label("date_created"),
            track_stats.c.date_start.label("date_start"),
            track_stats.c.date_end.label("date_end"),
        ).outerjoin(track_stats, TrackTable.id == track_stats.c.track_id)

        polygon_stats = (
            select(
                PolygonDatasetFeatureTable.dataset_id.label("dataset_id"),
                func.count(PolygonDatasetFeatureTable.id).label("feature_count"),
                func.array_agg(distinct(PolygonDatasetFeatureTable.category)).label("categories"),
                func.array_agg(PolygonDatasetFeatureTable.tags)
                .filter(func.cardinality(PolygonDatasetFeatureTable.tags) > 0)
                .label("tags"),
            )
            .group_by(PolygonDatasetFeatureTable.dataset_id)
            .subquery()
        )
        polygon_branch = select(
            PolygonDatasetTable.id.label("id"),
            PolygonDatasetTable.name.label("name"),
            literal(DatasetGeometryKind.POLYGON.value).label("geometry_kind"),
            func.coalesce(polygon_stats.c.feature_count, 0).label("feature_count"),
            polygon_stats.c.categories.label("categories"),
            polygon_stats.c.tags.label("tags"),
            PolygonDatasetTable.date_created.label("date_created"),
            cast(null(), DateTime(timezone=True)).label("date_start"),
            cast(null(), DateTime(timezone=True)).label("date_end"),
        ).outerjoin(polygon_stats, PolygonDatasetTable.id == polygon_stats.c.dataset_id)

        datasets = union_all(point_branch, track_branch, polygon_branch).subquery("datasets")

        count_stmt = select(func.count()).select_from(datasets)
        data_stmt = select(datasets)
        if request.geometry_kind is not None:
            count_stmt = count_stmt.where(datasets.c.geometry_kind == request.geometry_kind.value)
            data_stmt = data_stmt.where(datasets.c.geometry_kind == request.geometry_kind.value)

        total_count = (await self.session.execute(count_stmt)).scalar_one()

        order_column = datasets.c.date_created
        data_stmt = (
            data_stmt.order_by(order_column.desc() if request.sort_order == SortOrder.DESC else order_column.asc())
            .offset((request.page - 1) * request.limit)
            .limit(request.limit)
        )
        rows = (await self.session.execute(data_stmt)).all()
        results = [
            Dataset(
                id=row.id,
                name=row.name,
                geometry_kind=row.geometry_kind,
                feature_count=row.feature_count or 0,
                categories=sorted({c for c in (row.categories or []) if c is not None}),
                tags=sorted({t for tags in (row.tags or []) for t in (tags or [])}),
                date_created=row.date_created,
                date_start=row.date_start,
                date_end=row.date_end,
            )
            for row in rows
        ]

        total_pages = (total_count + request.limit - 1) // request.limit
        return PaginatedDatasetsResponse(
            total=total_count, page=request.page, limit=request.limit, total_pages=total_pages, data=results
        )

    async def get_dataset_detail(self, dataset_id: str) -> DatasetDetail | None:
        """Retrieve a dataset's full detail, trying each geometry kind's repository in turn."""
        point_dataset = await self.points.get_point_dataset_by_id(dataset_id)
        if point_dataset is not None:
            return point_dataset
        track = await self.tracks.get_track_by_id(dataset_id)
        if track is not None:
            return track
        return await self.polygons.get_polygon_dataset_by_id(dataset_id)

    async def download_dataset(self, dataset_id: str) -> dict | None:
        """Serialize a dataset's features to a GeoJSON FeatureCollection."""
        detail = await self.get_dataset_detail(dataset_id)
        if detail is None:
            return None

        if isinstance(detail, PointDatasetDetail):
            features = [
                {
                    "type": "Feature",
                    "geometry": point.geometry.model_dump(mode="json"),
                    "properties": {
                        **point.properties,
                        "category": point.category,
                        "name": point.name,
                        "tags": point.tags,
                    },
                }
                for point in detail.points
            ]
        elif isinstance(detail, TrackDetail):
            features = [
                {
                    "type": "Feature",
                    "geometry": point.geometry.model_dump(mode="json"),
                    "properties": {
                        "date_recorded": point.date_recorded.isoformat(),
                        "elevation_m": point.elevation_m,
                        "speed_mps": point.speed_mps,
                        "tags": point.tags,
                    },
                }
                for point in detail.points
            ]
        else:
            features = [
                {
                    "type": "Feature",
                    "geometry": polygon.geometry.model_dump(mode="json"),
                    "properties": {"category": polygon.category, "name": polygon.name, "tags": polygon.tags},
                }
                for polygon in detail.polygons
            ]
        return {"type": "FeatureCollection", "features": features}
