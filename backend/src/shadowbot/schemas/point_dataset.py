from datetime import datetime
from typing import Literal

from geojson_pydantic import Point
from pydantic import Field

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.common import DatasetGeometryKind, SortOrder


class PointFeatureCreate(CamelModel):
    """A single categorized point to add to a point dataset."""

    geometry: Point
    category: str
    name: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)


class PointFeature(PointFeatureCreate):
    """A persisted point dataset feature."""

    id: str
    dataset_id: str


class PointDatasetCreate(CamelModel):
    """Payload to create a new point dataset from uploaded geo data."""

    name: str
    points: list[PointFeatureCreate] = Field(default_factory=list)


class PointDataset(CamelModel):
    """Point dataset metadata, without its features."""

    id: str
    name: str
    geometry_kind: Literal[DatasetGeometryKind.POINT] = DatasetGeometryKind.POINT
    point_count: int = Field(default=0)
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    date_created: datetime


class PointDatasetDetail(PointDataset):
    """A point dataset including its full set of features."""

    points: list[PointFeature] = Field(default_factory=list)


class PointDatasetsRequest(CamelModel):
    """Query parameters for listing point datasets."""

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)
    sort_order: SortOrder = Field(default=SortOrder.DESC)


class PaginatedPointDatasetsResponse(CamelModel):
    """Paginated list of point dataset summaries."""

    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PointDataset]


class PointDatasetAlongRouteRequest(CamelModel):
    """Find a point dataset's features within a corridor around a previously planned route."""

    category: str | None = Field(default=None, description="Filter to one category, e.g. 'camera_light'")
    corridor_m: float = Field(
        default=100, gt=0, le=5_000, description="How far off the route path still counts as 'passed'"
    )
    limit: int = Field(default=50, ge=1, le=500)


class PointFeatureOnRoute(PointFeature):
    """A point dataset feature located along a route, with its distance to the route path."""

    distance_m: float
