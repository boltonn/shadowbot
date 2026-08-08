"""Abstract repository interface for track storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.track import PaginatedTracksResponse, Track, TrackCreate, TrackDetail, TracksRequest


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
