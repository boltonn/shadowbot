"""Schemas that unify point/track/polygon datasets into one browsable list and label/tag surface."""

from datetime import datetime

from pydantic import Field

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.common import DatasetGeometryKind, SortOrder
from shadowbot.schemas.point_dataset import PointDatasetDetail
from shadowbot.schemas.polygon_dataset import PolygonDatasetDetail
from shadowbot.schemas.track import TrackDetail

DatasetDetail = PointDatasetDetail | TrackDetail | PolygonDatasetDetail


class Dataset(CamelModel):
    """Summary of a dataset of any geometry kind, for the unified browsing list."""

    id: str
    name: str
    geometry_kind: DatasetGeometryKind
    feature_count: int = Field(default=0)
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    date_created: datetime
    date_start: datetime | None = Field(default=None, description="Track datasets only")
    date_end: datetime | None = Field(default=None, description="Track datasets only")


class DatasetsRequest(CamelModel):
    """Query parameters for listing datasets across all geometry kinds."""

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)
    sort_order: SortOrder = Field(default=SortOrder.DESC)
    geometry_kind: DatasetGeometryKind | None = Field(default=None)


class PaginatedDatasetsResponse(CamelModel):
    """Paginated list of dataset summaries across all geometry kinds."""

    total: int
    page: int
    limit: int
    total_pages: int
    data: list[Dataset]


class LabelFeatureRequest(CamelModel):
    """Replace a point/polygon feature's category, name, and tags with the given values.

    Every field is applied as-is (name=None clears the name) — send the feature's
    current values for anything you don't mean to change.
    """

    category: str
    name: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)


class LabelTrackPointRequest(CamelModel):
    """Update a track point's tags (track points have no category/name)."""

    tags: list[str] = Field(default_factory=list)


class BulkTagRequest(CamelModel):
    """Apply and/or remove tags across a set of features in one dataset."""

    feature_ids: list[str]
    add_tags: list[str] = Field(default_factory=list)
    remove_tags: list[str] = Field(default_factory=list)
