from datetime import datetime
from typing import Any, Literal

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
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Arbitrary extra columns/properties carried over from the uploaded file"
    )


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
    include_tags: list[str] = Field(
        default_factory=list,
        description=(
            "Only keep features carrying at least one of these tags, e.g. ['outdoor'] or ['verified']. "
            "Empty means no tag-based inclusion filter."
        ),
    )
    exclude_tags: list[str] = Field(
        default_factory=list,
        description=(
            "Drop features carrying any of these tags, e.g. ['indoor'] to skip indoor cameras that have "
            "no bearing on a road route. Use this whenever the person qualifies a request with a "
            "distinction the dataset's tags capture (indoor/outdoor, decommissioned, etc.) rather than "
            "ignoring the qualifier — check the dataset's tags (from list_point_datasets) first."
        ),
    )
    corridor_m: float = Field(
        default=100, gt=0, le=5_000, description="How far off the route path still counts as 'passed'"
    )
    limit: int = Field(default=50, ge=1, le=500)


class PointDatasetAvoidance(CamelModel):
    """An uploaded point dataset's matching features to route around, e.g. known camera locations.

    Resolved before routing by buffering every matching feature by buffer_m into an exclusion
    zone (the same mechanism as a user-drawn avoid area) — this is what makes 'avoid cameras'
    actually change the computed route, rather than just reporting how many are passed.
    """

    dataset_id: str
    category: str | None = Field(default=None, description="Filter to one category, e.g. 'camera'")
    include_tags: list[str] = Field(
        default_factory=list, description="Only avoid features carrying at least one of these tags"
    )
    exclude_tags: list[str] = Field(
        default_factory=list,
        description="Never avoid features carrying any of these tags, e.g. ['indoor'] for cameras with no bearing on a road route",
    )
    corridor_m: float = Field(
        default=1_000,
        gt=0,
        le=20_000,
        description="How far off the route/straight origin-destination line a feature still counts as relevant",
    )
    buffer_m: float = Field(
        default=50, gt=0, le=2_000, description="Radius around each matching feature excluded from routing"
    )


class PointFeatureOnRoute(PointFeature):
    """A point dataset feature located along a route, with its distance to the route path."""

    distance_m: float


class TabularPreview(CamelModel):
    """A preview of an uploaded CSV/Excel file's columns, used to map lat/long/category fields before upload."""

    columns: list[str]
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int
