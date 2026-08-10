from datetime import datetime
from typing import Literal

from geojson_pydantic import Polygon
from pydantic import Field

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.common import DatasetGeometryKind, SortOrder


class PolygonFeatureCreate(CamelModel):
    """A single categorized polygon to add to a polygon dataset."""

    geometry: Polygon
    category: str
    name: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)


class PolygonFeature(PolygonFeatureCreate):
    """A persisted polygon dataset feature."""

    id: str
    dataset_id: str


class PolygonDatasetCreate(CamelModel):
    """Payload to create a new polygon dataset from uploaded geo data."""

    name: str
    polygons: list[PolygonFeatureCreate] = Field(default_factory=list)


class PolygonDataset(CamelModel):
    """Polygon dataset metadata, without its features."""

    id: str
    name: str
    geometry_kind: Literal[DatasetGeometryKind.POLYGON] = DatasetGeometryKind.POLYGON
    polygon_count: int = Field(default=0)
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    date_created: datetime


class PolygonDatasetDetail(PolygonDataset):
    """A polygon dataset including its full set of features."""

    polygons: list[PolygonFeature] = Field(default_factory=list)


class PolygonDatasetsRequest(CamelModel):
    """Query parameters for listing polygon datasets."""

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)
    sort_order: SortOrder = Field(default=SortOrder.DESC)


class PaginatedPolygonDatasetsResponse(CamelModel):
    """Paginated list of polygon dataset summaries."""

    total: int
    page: int
    limit: int
    total_pages: int
    data: list[PolygonDataset]
