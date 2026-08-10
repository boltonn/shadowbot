from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.polygon_dataset import PolygonDatasetFeatureTable, PolygonDatasetTable
from shadowbot.datastores.postgres.utils import flatten_distinct_tags, geom_to_polygon, polygon_to_geom
from shadowbot.schemas.common import SortOrder
from shadowbot.schemas.dataset import BulkTagRequest, LabelFeatureRequest
from shadowbot.schemas.polygon_dataset import (
    PaginatedPolygonDatasetsResponse,
    PolygonDataset,
    PolygonDatasetCreate,
    PolygonDatasetDetail,
    PolygonDatasetsRequest,
    PolygonFeature,
)


class PostgresPolygonDatasetRepository:
    """Postgres implementation of PolygonDatasetRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_polygon_dataset(self, dataset: PolygonDatasetCreate) -> PolygonDataset:
        """Persist a new polygon dataset and its features in one transaction."""
        dataset_table = PolygonDatasetTable(
            id=str(uuid4()),
            name=dataset.name,
            date_created=datetime.now(UTC),
        )
        dataset_table.polygons = [
            PolygonDatasetFeatureTable(
                id=str(uuid4()),
                dataset_id=dataset_table.id,
                geom=polygon_to_geom(polygon.geometry),
                category=polygon.category,
                name=polygon.name,
                tags=polygon.tags,
            )
            for polygon in dataset.polygons
        ]
        self.session.add(dataset_table)
        await self.session.commit()
        return await self._summarize(dataset_table.id)

    async def get_polygon_dataset_by_id(self, dataset_id: str) -> PolygonDatasetDetail | None:
        """Retrieve a polygon dataset's metadata and full feature list."""
        result = await self.session.execute(select(PolygonDatasetTable).where(PolygonDatasetTable.id == dataset_id))
        dataset_table = result.scalar_one_or_none()
        if dataset_table is None:
            return None

        polygons_result = await self.session.execute(
            select(PolygonDatasetFeatureTable).where(PolygonDatasetFeatureTable.dataset_id == dataset_id)
        )
        polygons = [
            PolygonFeature(
                id=p.id,
                dataset_id=p.dataset_id,
                geometry=geom_to_polygon(p.geom),
                category=p.category,
                name=p.name,
                tags=p.tags,
            )
            for p in polygons_result.scalars().all()
        ]
        summary = await self._summarize(dataset_id)
        return PolygonDatasetDetail(**summary.model_dump(), polygons=polygons)

    async def get_polygon_datasets(self, request: PolygonDatasetsRequest) -> PaginatedPolygonDatasetsResponse:
        """List polygon dataset summaries, each enriched with polygon_count/categories/tags."""
        stats = (
            select(
                PolygonDatasetFeatureTable.dataset_id.label("dataset_id"),
                func.count(PolygonDatasetFeatureTable.id).label("polygon_count"),
                func.array_agg(distinct(PolygonDatasetFeatureTable.category)).label("categories"),
                func.array_agg(PolygonDatasetFeatureTable.tags)
                .filter(func.cardinality(PolygonDatasetFeatureTable.tags) > 0)
                .label("tags"),
            )
            .group_by(PolygonDatasetFeatureTable.dataset_id)
            .subquery()
        )

        total_count = (await self.session.execute(select(func.count(PolygonDatasetTable.id)))).scalar_one()

        order_column = PolygonDatasetTable.date_created
        data_stmt = (
            select(PolygonDatasetTable, stats.c.polygon_count, stats.c.categories, stats.c.tags)
            .outerjoin(stats, PolygonDatasetTable.id == stats.c.dataset_id)
            .order_by(order_column.desc() if request.sort_order == SortOrder.DESC else order_column.asc())
            .offset((request.page - 1) * request.limit)
            .limit(request.limit)
        )
        data_result = await self.session.execute(data_stmt)
        datasets = [
            PolygonDataset(
                id=d.id,
                name=d.name,
                polygon_count=polygon_count or 0,
                categories=categories or [],
                tags=flatten_distinct_tags(tags),
                date_created=d.date_created,
            )
            for d, polygon_count, categories, tags in data_result.all()
        ]

        total_pages = (total_count + request.limit - 1) // request.limit
        return PaginatedPolygonDatasetsResponse(
            total=total_count, page=request.page, limit=request.limit, total_pages=total_pages, data=datasets
        )

    async def label_feature(self, dataset_id: str, feature_id: str, request: LabelFeatureRequest) -> PolygonFeature:
        """Update a polygon feature's category, name, and tags."""
        feature = (
            await self.session.execute(
                select(PolygonDatasetFeatureTable).where(
                    PolygonDatasetFeatureTable.id == feature_id,
                    PolygonDatasetFeatureTable.dataset_id == dataset_id,
                )
            )
        ).scalar_one()
        feature.category = request.category
        feature.name = request.name
        feature.tags = request.tags
        await self.session.commit()
        return PolygonFeature(
            id=feature.id,
            dataset_id=feature.dataset_id,
            geometry=geom_to_polygon(feature.geom),
            category=feature.category,
            name=feature.name,
            tags=feature.tags,
        )

    async def bulk_tag_features(self, dataset_id: str, request: BulkTagRequest) -> list[PolygonFeature]:
        """Apply and/or remove tags across a set of this dataset's features."""
        features_result = await self.session.execute(
            select(PolygonDatasetFeatureTable).where(
                PolygonDatasetFeatureTable.dataset_id == dataset_id,
                PolygonDatasetFeatureTable.id.in_(request.feature_ids),
            )
        )
        features = list(features_result.scalars().all())
        for feature in features:
            feature.tags = sorted((set(feature.tags) | set(request.add_tags)) - set(request.remove_tags))
        await self.session.commit()
        return [
            PolygonFeature(
                id=f.id,
                dataset_id=f.dataset_id,
                geometry=geom_to_polygon(f.geom),
                category=f.category,
                name=f.name,
                tags=f.tags,
            )
            for f in features
        ]

    async def _summarize(self, dataset_id: str) -> PolygonDataset:
        dataset_table = (
            await self.session.execute(select(PolygonDatasetTable).where(PolygonDatasetTable.id == dataset_id))
        ).scalar_one()
        polygon_count, categories, tags = (
            await self.session.execute(
                select(
                    func.count(PolygonDatasetFeatureTable.id),
                    func.array_agg(distinct(PolygonDatasetFeatureTable.category)),
                    func.array_agg(PolygonDatasetFeatureTable.tags).filter(
                        func.cardinality(PolygonDatasetFeatureTable.tags) > 0
                    ),
                ).where(PolygonDatasetFeatureTable.dataset_id == dataset_id)
            )
        ).one()
        return PolygonDataset(
            id=dataset_table.id,
            name=dataset_table.name,
            polygon_count=polygon_count or 0,
            categories=categories or [],
            tags=flatten_distinct_tags(tags),
            date_created=dataset_table.date_created,
        )
