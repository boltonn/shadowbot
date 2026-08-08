"""Abstract repository interface for route computation."""

from abc import ABC, abstractmethod

from shadowbot.schemas.routing import RerouteRequest, Route, RouteRequest


class RoutingRepository(ABC):
    """Abstract base class for routing backends.

    Implementations compute a route against a road network (e.g. a locally
    cached OSM graph via networkx, or a pgRouting-backed network in
    Postgres) and return a fully-formed Route, including a generated ID.
    Persistence of that Route is a separate concern (see base/route.py).
    """

    @abstractmethod
    async def compute_route(self, request: RouteRequest) -> Route:
        """Compute a new route between the request's origin and destination."""

    @abstractmethod
    async def compute_reroute(self, route: Route, request: RerouteRequest) -> Route:
        """Recompute a prior route with additional avoidance constraints."""
