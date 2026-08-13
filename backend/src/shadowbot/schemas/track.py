from datetime import datetime
from enum import StrEnum
from typing import Literal

from geojson_pydantic import LineString, Point
from pydantic import Field

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.common import DatasetGeometryKind, SortOrder


class TrackSource(StrEnum):
    """Origin format of an uploaded track."""

    GEOJSON = "geojson"
    GPX = "gpx"
    SYNTHETIC = "synthetic"


class TrackPointCreate(CamelModel):
    """A single recorded point to add to a track."""

    geometry: Point
    date_recorded: datetime
    elevation_m: float | None = Field(default=None)
    speed_mps: float | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)


class TrackPoint(TrackPointCreate):
    """A persisted track point."""

    id: str
    track_id: str


class TrackCreate(CamelModel):
    """Payload to create a new track from uploaded geo data."""

    name: str
    source: TrackSource = Field(default=TrackSource.GEOJSON)
    points: list[TrackPointCreate] = Field(default_factory=list)


class Track(CamelModel):
    """Track metadata, without its points."""

    id: str
    name: str
    geometry_kind: Literal[DatasetGeometryKind.TRACK] = DatasetGeometryKind.TRACK
    source: TrackSource
    point_count: int = Field(default=0)
    tags: list[str] = Field(default_factory=list)
    date_created: datetime
    date_start: datetime | None = Field(default=None)
    date_end: datetime | None = Field(default=None)


class TrackDetail(Track):
    """A track including its full set of points."""

    points: list[TrackPoint] = Field(default_factory=list)


class MapMatchResult(CamelModel):
    """A track's raw GPS points snapped onto the actual roads it drove.

    Requires the Valhalla routing backend (map matching over raw networkx/osmnx
    graphs isn't implemented) — see datastores/valhalla/repository.py.
    """

    track_id: str
    geometry: LineString
    distance_m: float
    duration_s: float
    date_created: datetime


class TracksRequest(CamelModel):
    """Query parameters for listing tracks."""

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)
    sort_order: SortOrder = Field(default=SortOrder.DESC)


class PaginatedTracksResponse(CamelModel):
    """Paginated list of track summaries."""

    total: int
    page: int
    limit: int
    total_pages: int
    data: list[Track]


class LocationClassificationRule(CamelModel):
    """Tunable thresholds for guessing a frequented location's category from visit timing.

    Defaults assume a typical daytime work schedule. Override when a person's pattern
    differs — e.g. a night-shift worker's "home" dwells cluster during the day, not after
    night_hour_start, so night_hour_start/night_hour_end should shift to match.
    """

    night_hour_start: int = Field(default=19, ge=0, le=23, description="Hour a 'home' night window begins")
    night_hour_end: int = Field(default=6, ge=0, le=23, description="Hour a 'home' night window ends (exclusive)")
    home_min_night_share: float = Field(
        default=0.6, gt=0, le=1, description="Share of visits that must fall in the night window to guess 'home'"
    )
    home_min_dwell_h: float = Field(default=4, gt=0, description="Minimum average dwell hours to guess 'home'")
    work_hour_start: int = Field(default=5, ge=0, le=23, description="Hour a 'work' morning window begins")
    work_hour_end: int = Field(default=11, ge=0, le=23, description="Hour a 'work' morning window ends (exclusive)")
    work_min_morning_share: float = Field(
        default=0.6,
        gt=0,
        le=1,
        description="Share of weekday visits that must start in the morning window to guess 'work'",
    )
    work_dwell_h_range: tuple[float, float] = Field(
        default=(2.0, 12.0), description="Average dwell hours range (inclusive) to guess 'work'"
    )
    min_visits_to_classify: int = Field(
        default=2, ge=1, description="Minimum separate visits before guessing home/work at all"
    )


class FrequentedLocationsRequest(CamelModel):
    """Cluster GPS track history to find places visited more than once."""

    track_ids: list[str] | None = Field(
        default=None, description="Limit to these tracks; defaults to all uploaded tracks"
    )
    radius_m: float = Field(default=150, gt=0, le=2_000, description="Points within this radius count as one place")
    min_dwell_s: float = Field(
        default=300, gt=0, description="Minimum time stopped in one place to count as a visit, not passing through"
    )
    min_visits: int = Field(default=2, ge=1, description="Minimum separate visits to surface a location")
    limit: int = Field(default=10, ge=1, le=50)
    classification: LocationClassificationRule = Field(
        default_factory=LocationClassificationRule,
        description="Tune the home/work heuristic when the person's schedule is atypical",
    )


class LocationCategoryGuess(StrEnum):
    """Common categories the frequented-locations heuristic can recognize from visit timing."""

    HOME = "home"
    WORK = "work"
    UNKNOWN = "unknown"


class FrequentedLocation(CamelModel):
    """A place visited more than once, inferred from clustered track dwell periods."""

    geometry: Point
    visit_count: int = Field(description="Number of separate visits, not raw GPS point count")
    total_dwell_s: float = Field(description="Combined time spent at this location across all visits")
    date_first_visit: datetime
    date_last_visit: datetime
    category: str = Field(
        default=LocationCategoryGuess.UNKNOWN,
        description=(
            "Best-guess category from visit timing (home/work/unknown); freeform, "
            "so it can be overridden with anything, e.g. 'gym', 'kid's school'"
        ),
    )
    name: str | None = Field(default=None, description="A saved name for this location, e.g. 'Gym'")
