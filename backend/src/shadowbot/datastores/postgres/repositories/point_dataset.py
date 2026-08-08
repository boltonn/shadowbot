from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.point_dataset import PointDatasetFeatureTable, PointDatasetTable
from shadowbot.datastores.postgres.utils import geom_to_point, point_to_geom
from shadowbot.schemas.common import SortOrder
from shadowbot.schemas.point_dataset import (
    PaginatedPointDatasetsResponse,
    PointDataset,
    PointDatasetCreate,
    PointDatasetDetail,
    PointDatasetsRequest,
    PointFeature,
)


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
            )
            .group_by(PointDatasetFeatureTable.dataset_id)
            .subquery()
        )

        total_count = (await self.session.execute(select(func.count(PointDatasetTable.id)))).scalar_one()

        order_column = PointDatasetTable.date_created
        data_stmt = (
            select(PointDatasetTable, stats.c.point_count, stats.c.categories)
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
                date_created=d.date_created,
            )
            for d, point_count, categories in data_result.all()
        ]

        total_pages = (total_count + request.limit - 1) // request.limit
        return PaginatedPointDatasetsResponse(
            total=total_count, page=request.page, limit=request.limit, total_pages=total_pages, data=datasets
        )

    async def _summarize(self, dataset_id: str) -> PointDataset:
        dataset_table = (
            await self.session.execute(select(PointDatasetTable).where(PointDatasetTable.id == dataset_id))
        ).scalar_one()
        point_count, categories = (
            await self.session.execute(
                select(
                    func.count(PointDatasetFeatureTable.id),
                    func.array_agg(distinct(PointDatasetFeatureTable.category)),
                ).where(PointDatasetFeatureTable.dataset_id == dataset_id)
            )
        ).one()
        return PointDataset(
            id=dataset_table.id,
            name=dataset_table.name,
            point_count=point_count or 0,
            categories=categories or [],
            date_created=dataset_table.date_created,
        )
