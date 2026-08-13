from datetime import UTC, datetime
from uuid import uuid4

from shapely.geometry import shape
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.point_dataset import PointDatasetFeatureTable, PointDatasetTable
from shadowbot.datastores.postgres.utils import flatten_distinct_tags, geom_to_point, point_to_geom
from shadowbot.schemas.common import SortOrder
from shadowbot.schemas.dataset import BulkTagRequest, LabelFeatureRequest
from shadowbot.schemas.point_dataset import (
    PaginatedPointDatasetsResponse,
    PointDataset,
    PointDatasetAlongRouteRequest,
    PointDatasetCreate,
    PointDatasetDetail,
    PointDatasetsRequest,
    PointFeature,
    PointFeatureOnRoute,
)
from shadowbot.schemas.routing import Route

# Good enough for a single-region prototype without a projected-CRS round trip — matches
# the same tradeoff PoiRepository.find_along_route makes for its own corridor buffer.
_METERS_PER_DEGREE = 111_320


class PostgresPointDatasetRepository:
    """Postgres implementation of PointDatasetRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_point_dataset(self, dataset: PointDatasetCreate) -> PointDataset:
        """Persist a new point dataset and its features in one transaction."""
        dataset_table = PointDatasetTable(
            id=str(uuid4()),
            name=dataset.name,
            date_created=datetime.now(UTC),
        )
        dataset_table.points = [
            PointDatasetFeatureTable(
                id=str(uuid4()),
                dataset_id=dataset_table.id,
                geom=point_to_geom(point.geometry),
                category=point.category,
                name=point.name,
                tags=point.tags,
                properties=point.properties,
            )
            for point in dataset.points
        ]
        self.session.add(dataset_table)
        await self.session.commit()
        return await self._summarize(dataset_table.id)

    async def get_point_dataset_by_id(self, dataset_id: str) -> PointDatasetDetail | None:
        """Retrieve a point dataset's metadata and full feature list."""
        result = await self.session.execute(select(PointDatasetTable).where(PointDatasetTable.id == dataset_id))
        dataset_table = result.scalar_one_or_none()
        if dataset_table is None:
            return None

        points_result = await self.session.execute(
            select(PointDatasetFeatureTable).where(PointDatasetFeatureTable.dataset_id == dataset_id)
        )
        points = [
            PointFeature(
                id=p.id,
                dataset_id=p.dataset_id,
                geometry=geom_to_point(p.geom),
                category=p.category,
                name=p.name,
                tags=p.tags,
                properties=p.properties,
            )
            for p in points_result.scalars().all()
        ]
        summary = await self._summarize(dataset_id)
        return PointDatasetDetail(**summary.model_dump(), points=points)

    async def get_point_datasets(self, request: PointDatasetsRequest) -> PaginatedPointDatasetsResponse:
        """List point dataset summaries, each enriched with point_count/categories."""
        stats = (
            select(
                PointDatasetFeatureTable.dataset_id.label("dataset_id"),
                func.count(PointDatasetFeatureTable.id).label("point_count"),
                func.array_agg(distinct(PointDatasetFeatureTable.category)).label("categories"),
                func.array_agg(PointDatasetFeatureTable.tags)
                .filter(func.cardinality(PointDatasetFeatureTable.tags) > 0)
                .label("tags"),
            )
            .group_by(PointDatasetFeatureTable.dataset_id)
            .subquery()
        )

        total_count = (await self.session.execute(select(func.count(PointDatasetTable.id)))).scalar_one()

        order_column = PointDatasetTable.date_created
        data_stmt = (
            select(PointDatasetTable, stats.c.point_count, stats.c.categories, stats.c.tags)
            .outerjoin(stats, PointDatasetTable.id == stats.c.dataset_id)
            .order_by(order_column.desc() if request.sort_order == SortOrder.DESC else order_column.asc())
            .offset((request.page - 1) * request.limit)
            .limit(request.limit)
        )
        data_result = await self.session.execute(data_stmt)
        datasets = [
            PointDataset(
                id=d.id,
                name=d.name,
                point_count=point_count or 0,
                categories=categories or [],
                tags=flatten_distinct_tags(tags),
                date_created=d.date_created,
            )
            for d, point_count, categories, tags in data_result.all()
        ]

        total_pages = (total_count + request.limit - 1) // request.limit
        return PaginatedPointDatasetsResponse(
            total=total_count, page=request.page, limit=request.limit, total_pages=total_pages, data=datasets
        )

    async def find_along_route(
        self, dataset_id: str, route: Route, request: PointDatasetAlongRouteRequest
    ) -> list[PointFeatureOnRoute]:
        """Find this dataset's features within a corridor around a previously planned route."""
        dataset = await self.get_point_dataset_by_id(dataset_id)
        if dataset is None:
            return []

        route_line = shape(route.geometry.model_dump(mode="json"))
        results = []
        for point in dataset.points:
            if request.category and point.category != request.category:
                continue
            distance_m = route_line.distance(shape(point.geometry.model_dump(mode="json"))) * _METERS_PER_DEGREE
            if distance_m <= request.corridor_m:
                results.append(PointFeatureOnRoute(**point.model_dump(), distance_m=distance_m))

        results.sort(key=lambda point: point.distance_m)
        return results[: request.limit]

    async def label_feature(self, dataset_id: str, feature_id: str, request: LabelFeatureRequest) -> PointFeature:
        """Update a point feature's category, name, and tags."""
        feature = (
            await self.session.execute(
                select(PointDatasetFeatureTable).where(
                    PointDatasetFeatureTable.id == feature_id, PointDatasetFeatureTable.dataset_id == dataset_id
                )
            )
        ).scalar_one()
        feature.category = request.category
        feature.name = request.name
        feature.tags = request.tags
        await self.session.commit()
        return PointFeature(
            id=feature.id,
            dataset_id=feature.dataset_id,
            geometry=geom_to_point(feature.geom),
            category=feature.category,
            name=feature.name,
            tags=feature.tags,
            properties=feature.properties,
        )

    async def bulk_tag_features(self, dataset_id: str, request: BulkTagRequest) -> list[PointFeature]:
        """Apply and/or remove tags across a set of this dataset's features."""
        features_result = await self.session.execute(
            select(PointDatasetFeatureTable).where(
                PointDatasetFeatureTable.dataset_id == dataset_id,
                PointDatasetFeatureTable.id.in_(request.feature_ids),
            )
        )
        features = list(features_result.scalars().all())
        for feature in features:
            feature.tags = sorted((set(feature.tags) | set(request.add_tags)) - set(request.remove_tags))
        await self.session.commit()
        return [
            PointFeature(
                id=f.id,
                dataset_id=f.dataset_id,
                geometry=geom_to_point(f.geom),
                category=f.category,
                name=f.name,
                tags=f.tags,
                properties=f.properties,
            )
            for f in features
        ]

    async def _summarize(self, dataset_id: str) -> PointDataset:
        dataset_table = (
            await self.session.execute(select(PointDatasetTable).where(PointDatasetTable.id == dataset_id))
        ).scalar_one()
        point_count, categories, tags = (
            await self.session.execute(
                select(
                    func.count(PointDatasetFeatureTable.id),
                    func.array_agg(distinct(PointDatasetFeatureTable.category)),
                    func.array_agg(PointDatasetFeatureTable.tags).filter(
                        func.cardinality(PointDatasetFeatureTable.tags) > 0
                    ),
                ).where(PointDatasetFeatureTable.dataset_id == dataset_id)
            )
        ).one()
        return PointDataset(
            id=dataset_table.id,
            name=dataset_table.name,
            point_count=point_count or 0,
            categories=categories or [],
            tags=flatten_distinct_tags(tags),
            date_created=dataset_table.date_created,
        )
