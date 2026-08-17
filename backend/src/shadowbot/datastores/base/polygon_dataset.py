"""Abstract repository interface for polygon dataset storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.dataset import BulkTagRequest, LabelFeatureRequest
from shadowbot.schemas.polygon_dataset import (
    PaginatedPolygonDatasetsResponse,
    PolygonDataset,
    PolygonDatasetCreate,
    PolygonDatasetDetail,
    PolygonDatasetsRequest,
    PolygonFeature,
    PolygonFeatureCreate,
)


class PolygonDatasetRepository(ABC):
    """Abstract base class for polygon dataset datastores."""

    @abstractmethod
    async def add_polygon_dataset(self, dataset: PolygonDatasetCreate) -> PolygonDataset:
        """Persist a new polygon dataset and its features."""

    @abstractmethod
    async def get_polygon_dataset_by_id(self, dataset_id: str) -> PolygonDatasetDetail | None:
        """Retrieve a polygon dataset, including its features, by ID."""

    @abstractmethod
    async def get_polygon_datasets(self, request: PolygonDatasetsRequest) -> PaginatedPolygonDatasetsResponse:
        """List polygon dataset summaries."""

    @abstractmethod
    async def add_feature(self, dataset_id: str, request: PolygonFeatureCreate) -> PolygonFeature:
        """Add a single feature to an existing polygon dataset."""

    @abstractmethod
    async def label_feature(self, dataset_id: str, feature_id: str, request: LabelFeatureRequest) -> PolygonFeature:
        """Update a feature's category, name, and tags."""

    @abstractmethod
    async def bulk_tag_features(self, dataset_id: str, request: BulkTagRequest) -> list[PolygonFeature]:
        """Apply and/or remove tags across a set of a dataset's features."""
