"""Abstract repository interface for point dataset storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.point_dataset import (
    PaginatedPointDatasetsResponse,
    PointDataset,
    PointDatasetCreate,
    PointDatasetDetail,
    PointDatasetsRequest,
)


class PointDatasetRepository(ABC):
    """Abstract base class for point dataset datastores."""

    @abstractmethod
    async def add_point_dataset(self, dataset: PointDatasetCreate) -> PointDataset:
        """Persist a new point dataset and its features."""

    @abstractmethod
    async def get_point_dataset_by_id(self, dataset_id: str) -> PointDatasetDetail | None:
        """Retrieve a point dataset, including its features, by ID."""

    @abstractmethod
    async def get_point_datasets(self, request: PointDatasetsRequest) -> PaginatedPointDatasetsResponse:
        """List point dataset summaries."""
