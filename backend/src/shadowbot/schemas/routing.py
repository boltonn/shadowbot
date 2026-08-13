from datetime import datetime
from enum import StrEnum

from geojson_pydantic import LineString, Point, Polygon
from pydantic import Field, model_validator

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.poi import OsmTag, PoiCategory


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
    max_alternates: int = Field(
        default=0,
        ge=0,
        le=3,
        description=(
            "Additional alternative paths to compute alongside the primary route "
            "(Valhalla backend only). Only honored when waypoints is empty — Valhalla "
            "doesn't support alternates for multi-stop trips, so this is silently ignored "
            "if waypoints are set."
        ),
    )


class RerouteRequest(CamelModel):
    """A request to recompute a prior route, optionally with a new ordered stop list."""

    avoid: AvoidancePreferences
    avoid_prior_route: bool = Field(
        default=False,
        description="Exclude the previously computed route's own path, for 'take a different way'",
    )
    waypoints: list[Point] | None = Field(
        default=None,
        description=(
            "Full replacement ordered list of intermediate stops. Omit to keep the prior route's "
            "waypoints unchanged; pass the prior list plus/minus a stop, in the desired order, to "
            "add or remove one (e.g. 'add a stop at the gas station')."
        ),
    )


class RouteAlternate(CamelModel):
    """A less-preferred path between the same origin and destination as a computed route."""

    id: str
    geometry: LineString
    distance_m: float
    duration_s: float


class RouteLeg(CamelModel):
    """One point-to-point segment of a route, between consecutive origin/waypoint/destination stops."""

    origin: Point
    destination: Point
    geometry: LineString
    distance_m: float
    duration_s: float


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
    legs: list[RouteLeg] = Field(default_factory=list, description="Per-stop segments; >1 entry when waypoints are set")
    alternates: list[RouteAlternate] = Field(default_factory=list)
    date_created: datetime


class AreaMatch(CamelModel):
    """An area feature (a park, lake, mall, or any other tagged polygon) a candidate route passes through."""

    name: str | None = Field(default=None)
    category: PoiCategory | str = Field(
        description="A PoiCategory value, or 'key=value' for a match found via through_raw_tags"
    )
    geometry: Polygon
    area_m2: float
    exit_count: int = Field(
        description=(
            "Distinct points where the road/path network crosses the feature's outer boundary — a heuristic "
            "proxy for entrances/exits, since OSM entrance tagging is too inconsistent to rely on directly."
        )
    )


class RouteSearchCriteria(CamelModel):
    """Criteria for generating and filtering candidate routes, rather than planning one specific route.

    Mode and avoidance map directly onto routing-engine inputs. The through_* area criteria can't
    be expressed to the routing engine at all, so every generated candidate is checked against them
    after the fact, and only candidates clearing every requested threshold are returned.
    """

    origin: Point
    destination: Point
    network_type: NetworkType = Field(default=NetworkType.DRIVE)
    avoid: AvoidancePreferences = Field(default_factory=AvoidancePreferences)
    avoid_places: list[str] = Field(
        default_factory=list,
        description=(
            "Free-text places or roads to avoid, e.g. 'I-95' or 'downtown' — geocoded and excluded with a "
            "buffer of avoid_radius_m, combined with any structured avoid preferences."
        ),
    )
    avoid_radius_m: float = Field(default=300, gt=0, le=5_000)
    through_categories: list[PoiCategory] = Field(
        default_factory=list,
        description="e.g. [park] to require the route pass through a park; combine freely with through_raw_tags",
    )
    through_raw_tags: list[OsmTag] = Field(
        default_factory=list,
        description=(
            "Raw OSM key/value tags for an area feature not in PoiCategory, e.g. {key: 'natural', value: "
            "'water'} for a lake or {key: 'shop', value: 'mall'}. Use common OSM tagging conventions "
            "directly rather than refusing a search just because it isn't in the curated category list."
        ),
    )
    min_area_m2: float | None = Field(
        default=None, gt=0, description="Minimum area of the through_categories/through_raw_tags feature"
    )
    min_area_exits: int | None = Field(
        default=None, ge=1, description="Minimum exit_count of the through_categories/through_raw_tags feature"
    )
    area_corridor_m: float = Field(
        default=50, gt=0, le=500, description="How close the route must pass to the area feature to count as going through it"
    )
    max_candidates: int = Field(
        default=3,
        ge=1,
        le=3,
        description=(
            "Alternative paths to consider beyond the primary route (Valhalla backend only — the "
            "networkx fallback only ever produces the primary route)."
        ),
    )

    @model_validator(mode="after")
    def _require_area_tags_if_area_criteria(self) -> "RouteSearchCriteria":
        wants_area = self.min_area_m2 is not None or self.min_area_exits is not None
        if wants_area and not self.through_categories and not self.through_raw_tags:
            raise ValueError("through_categories or through_raw_tags is required when min_area_m2/min_area_exits is set")
        return self


class RouteSearchMatch(CamelModel):
    """One candidate route that satisfied every criterion in a RouteSearchCriteria search."""

    route: Route
    matched_area: AreaMatch | None = Field(
        default=None, description="The qualifying area feature the route passes through, when area criteria were set"
    )


class RouteCompareRequest(CamelModel):
    """Two previously computed routes to compare."""

    route_id_a: str
    route_id_b: str


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


class MatrixEntry(CamelModel):
    """One source→target pair from a time-distance matrix. None fields mean unreachable by road."""

    distance_m: float | None
    duration_s: float | None
