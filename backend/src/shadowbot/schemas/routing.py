from datetime import datetime
from enum import StrEnum

from geojson_pydantic import LineString, Point, Polygon
from pydantic import Field

from shadowbot.schemas.base import CamelModel


class NetworkType(StrEnum):
    """osmnx street network filter — what mode of travel the road graph should represent."""

    DRIVE = "drive"
    DRIVE_SERVICE = "drive_service"
    WALK = "walk"
    BIKE = "bike"
    ALL = "all"


class GeocodeRequest(CamelModel):
    """A free-text place lookup."""

    query: str
    limit: int = Field(default=5, ge=1, le=20)


class GeocodeResult(CamelModel):
    """A single geocoding match."""

    display_name: str
    geometry: Point
    place_type: str | None = Field(default=None)


class AvoidancePreferences(CamelModel):
    """Constraints applied when computing a route.

    exclude_polygons covers both user-drawn avoid areas and "avoid this road"
    (a buffer drawn around the clicked road's geometry) with one mechanism.
    """

    avoid_tolls: bool = Field(default=False)
    avoid_highways: bool = Field(default=False)
    avoid_unpaved: bool = Field(default=False)
    avoid_ferries: bool = Field(default=False)
    exclude_polygons: list[Polygon] = Field(default_factory=list)


class RouteRequest(CamelModel):
    """A request to plan a route between two points, optionally via ordered intermediate stops."""

    origin: Point
    destination: Point
    waypoints: list[Point] = Field(
        default_factory=list, description="Ordered intermediate stops between origin and destination"
    )
    network_type: NetworkType = Field(default=NetworkType.DRIVE)
    avoid: AvoidancePreferences = Field(default_factory=AvoidancePreferences)


class RerouteRequest(CamelModel):
    """A request to recompute a prior route with additional avoidance constraints."""

    avoid: AvoidancePreferences
    avoid_prior_route: bool = Field(
        default=False,
        description="Exclude the previously computed route's own path, for 'take a different way'",
    )


class Route(CamelModel):
    """A computed route."""

    id: str
    geometry: LineString
    distance_m: float
    duration_s: float
    origin: Point
    destination: Point
    waypoints: list[Point] = Field(default_factory=list)
    network_type: NetworkType = Field(default=NetworkType.DRIVE)
    avoid: AvoidancePreferences
    date_created: datetime


class RouteComparison(CamelModel):
    """A comparison between two previously computed routes."""

    route_a_id: str
    route_b_id: str
    distance_delta_m: float = Field(description="route_b's distance minus route_a's; negative means b is shorter")
    duration_delta_s: float = Field(description="route_b's duration minus route_a's; negative means b is faster")
    shared_path_fraction: float = Field(
        ge=0,
        le=1,
        description="Fraction of the two routes' combined length that follows the same path (within ~30m)",
    )


class ArrivalEstimateRequest(CamelModel):
    """Estimate an arrival time for a previously planned route given a departure time."""

    date_departure: datetime


class ArrivalEstimate(CamelModel):
    """A congestion-adjusted arrival estimate for a route.

    There's no live traffic feed here — this applies a static time-of-day/day-of-week
    heuristic to the route's free-flow duration. Treat it as a rough estimate, not a
    real-time prediction.
    """

    route_id: str
    date_departure: datetime
    date_arrival: datetime
    free_flow_duration_s: float = Field(description="The route's duration with no congestion adjustment")
    estimated_duration_s: float = Field(description="Duration after applying the time-of-day heuristic")
    congestion_multiplier: float


class IsochroneRequest(CamelModel):
    """Request the reachable area from a point within a time budget."""

    origin: Point
    minutes: float = Field(gt=0, le=120)
    network_type: NetworkType = Field(default=NetworkType.DRIVE)
    avoid: AvoidancePreferences = Field(default_factory=AvoidancePreferences)


class Isochrone(CamelModel):
    """The reachable area from a point within a time budget, over the real road network."""

    origin: Point
    minutes: float
    geometry: Polygon
    reachable_node_count: int = Field(
        description="Number of road-network nodes within the time budget — a rough density signal"
    )
