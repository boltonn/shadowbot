"""Abstract repository interface for track storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.dataset import BulkTagRequest, LabelTrackPointRequest
from shadowbot.schemas.track import (
    PaginatedTracksResponse,
    Track,
    TrackCreate,
    TrackDetail,
    TrackPoint,
    TracksRequest,
)


class TrackRepository(ABC):
    """Abstract base class for track datastores."""

    @abstractmethod
    async def add_track(self, track: TrackCreate) -> Track:
        """Persist a new track and its points."""

    @abstractmethod
    async def get_track_by_id(self, track_id: str) -> TrackDetail | None:
        """Retrieve a track, including its points, by ID."""

    @abstractmethod
    async def get_tracks(self, request: TracksRequest) -> PaginatedTracksResponse:
        """List track summaries."""

    @abstractmethod
    async def label_feature(self, track_id: str, point_id: str, request: LabelTrackPointRequest) -> TrackPoint:
        """Update a track point's tags."""

    @abstractmethod
    async def bulk_tag_features(self, track_id: str, request: BulkTagRequest) -> list[TrackPoint]:
        """Apply and/or remove tags across a set of a track's points."""
