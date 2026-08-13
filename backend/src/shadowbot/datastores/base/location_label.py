"""Abstract repository interface for location label storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.location_label import LocationLabel, LocationLabelCreate


class LocationLabelRepository(ABC):
    """Abstract base class for location label datastores."""

    @abstractmethod
    async def save_location_label(self, label: LocationLabelCreate) -> LocationLabel:
        """Create a new location label, or update one already saved near this point."""

    @abstractmethod
    async def get_location_labels(self) -> list[LocationLabel]:
        """List all saved location labels."""
