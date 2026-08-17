"""Abstract repository interface for point dataset storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.dataset import BulkTagRequest, LabelFeatureRequest
from shadowbot.schemas.point_dataset import (
    PaginatedPointDatasetsResponse,
    PointDataset,
    PointDatasetCreate,
    PointDatasetDetail,
    PointDatasetsRequest,
    PointFeature,
    PointFeatureCreate,
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

    @abstractmethod
    async def add_feature(self, dataset_id: str, request: PointFeatureCreate) -> PointFeature:
        """Add a single feature to an existing point dataset."""

    @abstractmethod
    async def label_feature(self, dataset_id: str, feature_id: str, request: LabelFeatureRequest) -> PointFeature:
        """Update a feature's category, name, and tags."""

    @abstractmethod
    async def bulk_tag_features(self, dataset_id: str, request: BulkTagRequest) -> list[PointFeature]:
        """Apply and/or remove tags across a set of a dataset's features."""
