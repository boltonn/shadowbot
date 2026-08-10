"""Abstract repository interface for route computation.

compute_route and compute_isochrone are backend-specific — they need an actual
road network or tile source (a locally cached OSM graph via networkx, pre-built
Valhalla tiles, or a pgRouting-backed network in Postgres). compute_reroute,
compare_routes, and estimate_arrival operate purely on already-computed Route
objects, so they're shared here across backends rather than duplicated.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta

from geojson_pydantic import Point, Polygon
from shapely.geometry import mapping, shape

from shadowbot.schemas.routing import (
    ArrivalEstimate,
    Isochrone,
    IsochroneRequest,
    MatrixEntry,
    NetworkType,
    RerouteRequest,
    Route,
    RouteComparison,
    RouteRequest,
)
from shadowbot.schemas.track import MapMatchResult, TrackDetail

_VALHALLA_ONLY_MESSAGE = (
    "{feature} requires the Valhalla routing backend, which isn't configured for this deployment "
    "(set VALHALLA__TILE_URI). Let the user know this feature needs an administrator to enable it."
)

_REROUTE_BUFFER_DEGREES = 0.0003  # ~30m; good enough without a projected-CRS round trip for a single-region prototype


def _congestion_multiplier(departure: datetime) -> float:
    """A static time-of-day/day-of-week heuristic — there's no live traffic feed to draw on.

    Weekday rush hours get the biggest bump, weekday midday a smaller one, and
    weekends a small bump around typical errand-running hours. Everything else
    is treated as free-flow.
    """
    is_weekday = departure.weekday() < 5
    hour = departure.hour
    if is_weekday:
        if 7 <= hour < 9:
            return 1.4
        if 16 <= hour < 18:
            return 1.5
        if 9 <= hour < 16:
            return 1.1
        return 1.0
    if 11 <= hour < 15:
        return 1.15
    return 1.0


class RoutingRepository(ABC):
    """Abstract base class for routing backends.

    Implementations compute a route against a road network (e.g. a locally
    cached OSM graph via networkx, pre-built Valhalla tiles, or a
    pgRouting-backed network in Postgres) and return a fully-formed Route,
    including a generated ID. Persistence of that Route is a separate concern
    (see base/route.py).
    """

    supports_matrix: bool = False
    supports_map_matching: bool = False

    @abstractmethod
    async def compute_route(self, request: RouteRequest) -> Route:
        """Compute a new route between the request's origin and destination."""

    @abstractmethod
    async def compute_isochrone(self, request: IsochroneRequest) -> Isochrone:
        """Compute the reachable area from a point within a time budget, over the road network."""

    async def compute_matrix(
        self, *, origin: Point, destinations: list[Point], network_type: NetworkType = NetworkType.DRIVE
    ) -> list[MatrixEntry]:
        """Real drive time/distance from origin to each destination, aligned by index.

        Valhalla-only — check `supports_matrix` before calling rather than relying on
        this raising, so a POI ranking that just wants the best-effort result can fall
        back to straight-line distance instead of failing outright.
        """
        raise NotImplementedError(_VALHALLA_ONLY_MESSAGE.format(feature="compute_matrix"))

    async def match_track(self, *, track: TrackDetail) -> MapMatchResult:
        """Snap a track's raw GPS points onto the actual roads it drove.

        Valhalla-only — check `supports_map_matching` before calling.
        """
        raise NotImplementedError(_VALHALLA_ONLY_MESSAGE.format(feature="match_track"))

    async def compute_reroute(self, route: Route, request: RerouteRequest) -> Route:
        """Recompute a prior route, optionally excluding the prior route's own path."""
        avoid = request.avoid.model_copy(deep=True)
        if request.avoid_prior_route:
            buffered = shape(route.geometry.model_dump(mode="json")).buffer(_REROUTE_BUFFER_DEGREES)
            avoid.exclude_polygons.append(Polygon(**mapping(buffered)))
        new_request = RouteRequest(
            origin=route.origin,
            destination=route.destination,
            waypoints=route.waypoints,
            network_type=route.network_type,
            avoid=avoid,
        )
        return await self.compute_route(new_request)

    async def compare_routes(self, route_a: Route, route_b: Route) -> RouteComparison:
        """Diff two previously computed routes: which is shorter/faster, and how much they overlap."""
        line_a = shape(route_a.geometry.model_dump(mode="json"))
        line_b = shape(route_b.geometry.model_dump(mode="json"))
        a_within_b = line_a.intersection(line_b.buffer(_REROUTE_BUFFER_DEGREES)).length
        b_within_a = line_b.intersection(line_a.buffer(_REROUTE_BUFFER_DEGREES)).length
        total_length = line_a.length + line_b.length
        shared_fraction = (a_within_b + b_within_a) / total_length if total_length else 0.0
        return RouteComparison(
            route_a_id=route_a.id,
            route_b_id=route_b.id,
            distance_delta_m=route_b.distance_m - route_a.distance_m,
            duration_delta_s=route_b.duration_s - route_a.duration_s,
            shared_path_fraction=shared_fraction,
        )

    async def estimate_arrival(self, route: Route, date_departure: datetime) -> ArrivalEstimate:
        """Estimate arrival time by applying a time-of-day congestion heuristic to a route's duration."""
        multiplier = _congestion_multiplier(date_departure)
        estimated_duration_s = route.duration_s * multiplier
        return ArrivalEstimate(
            route_id=route.id,
            date_departure=date_departure,
            date_arrival=date_departure + timedelta(seconds=estimated_duration_s),
            free_flow_duration_s=route.duration_s,
            estimated_duration_s=estimated_duration_s,
            congestion_multiplier=multiplier,
        )
