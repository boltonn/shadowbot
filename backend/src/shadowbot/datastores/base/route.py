"""Abstract repository interface for persisted route storage."""

from abc import ABC, abstractmethod

from shadowbot.schemas.routing import Route


class RouteRepository(ABC):
    """Abstract base class for route archive datastores."""

    @abstractmethod
    async def add_route(self, route: Route) -> Route:
        """Persist a computed route."""

    @abstractmethod
    async def get_route_by_id(self, route_id: str) -> Route | None:
        """Retrieve a previously computed route by ID."""
