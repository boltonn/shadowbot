from datetime import datetime
from enum import StrEnum
from typing import Literal

from geojson_pydantic import LineString, MultiPolygon, Point, Polygon
from pydantic import Field, model_validator

from shadowbot.schemas.base import CamelModel
from shadowbot.schemas.poi import OsmTag, PoiCategory, _PoiTagFields
from shadowbot.schemas.point_dataset import PointDatasetAvoidance


class NetworkType(StrEnum):
    """osmnx street network filter — what mode of travel the road graph should represent."""

    DRIVE = "drive"
    DRIVE_SERVICE = "drive_service"
    WALK = "walk"
    BIKE = "bike"
    ALL = "all"


class BoundaryContact(StrEnum):
    """How a way must relate to an area feature's boundary to count as a match.

    CROSSES passes through the interior (a path that continues on the other side).
    TOUCHES reaches the boundary without necessarily continuing through it (e.g. a
    road that dead-ends right at a park's edge). ANY counts either.
    """

    CROSSES = "crosses"
    TOUCHES = "touches"
    ANY = "any"


class GeocodeRequest(CamelModel):
    """A free-text place lookup."""

    query: str
    limit: int = Field(default=5, ge=1, le=20)


class GeocodeResult(CamelModel):
    """A single geocoding match.

    Nominatim's raw OSM identity and address detail to show underlying element rather
    than just a name and a pin.
    """

    display_name: str
    geometry: Point
    place_type: str | None = Field(default=None)
    osm_type: str | None = Field(default=None, description="OSM element type: node, way, or relation")
    osm_id: int | None = Field(default=None)
    osm_class: str | None = Field(default=None, description="Nominatim's category/class field, e.g. 'amenity', 'shop'")
    address: dict[str, str] = Field(
        default_factory=dict, description="Structured address components (house_number, road, city, state, etc.)"
    )
    boundary: Polygon | MultiPolygon | None = Field(
        default=None,
        description=(
            "The result's actual administrative/area boundary (a city, county, park, etc.), when Nominatim "
            "has one — None for a point-only result like an address or POI. Pass this as AreaSearchRequest.boundary "
            "to search everywhere within the place rather than a radius around its center point."
        ),
    )


class AvoidancePreferences(CamelModel):
    """Constraints applied when computing a route.

    exclude_polygons covers both user-drawn avoid areas and "avoid this road"
    (a buffer drawn around the clicked road's geometry) with one mechanism.
    avoid_point_datasets is resolved into more exclude_polygons before routing (see
    analytics/avoidance.py) — it's the mechanism that makes 'avoid known camera locations'
    actually change the computed route, rather than just reporting how many are passed.
    """

    avoid_tolls: bool = Field(default=False)
    avoid_highways: bool = Field(default=False)
    avoid_unpaved: bool = Field(default=False)
    avoid_ferries: bool = Field(default=False)
    exclude_polygons: list[Polygon] = Field(default_factory=list)
    avoid_point_datasets: list[PointDatasetAvoidance] = Field(default_factory=list)


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
    """A tagged OSM feature found by find_area_features/search_areas, or one a candidate route passes through.

    Most categories (restaurants, bus stops, police stations, etc.) are mapped as single points in
    OSM; a smaller set (parks, lakes, malls, bases, etc.) are mapped as polygons and carry a real
    boundary. geometry reflects whichever OSM actually has — area_m2/exit_count are only meaningful,
    and only populated, for a polygon match, since a point has no area or boundary for a road to
    touch. A request that filters on min_area_m2/max_area_m2/min_boundary_count naturally keeps
    only polygon matches, since point matches never satisfy any of them.
    """

    name: str | None = Field(default=None)
    category: PoiCategory | str = Field(
        description="A PoiCategory value, or 'key=value' for a match found via raw_tags/through_raw_tags"
    )
    geometry: Point | Polygon
    area_m2: float | None = Field(default=None, description="Set only when geometry is a Polygon/MultiPolygon")
    exit_count: int | None = Field(
        default=None,
        description=(
            "Set only when geometry is a Polygon/MultiPolygon. Distinct points where the road/path network "
            "contacts the feature's outer boundary, per the search's way-type and boundary-contact filters — "
            "a heuristic proxy for entrances/exits, since OSM entrance tagging is too inconsistent to rely on "
            "directly."
        ),
    )
    osm_type: str | None = Field(default=None, description="OSM element type: node, way, or relation")
    osm_id: int | None = Field(default=None)
    raw_tags: dict[str, str] = Field(
        default_factory=dict, description="Every OSM tag on the element (name, operator, website, etc.)"
    )
    url: str | None = Field(default=None, description="Link to the raw element on openstreetmap.org")


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
    through_way_types: list[str] = Field(
        default_factory=list,
        description=(
            "OSM highway= tag values that count toward min_area_exits, e.g. ['path', 'footway', 'track'] "
            "for trails/paths, or ['residential', 'service'] for small roads. Empty means every way type "
            "counts. Use common OSM tagging conventions directly, same as through_raw_tags."
        ),
    )
    through_boundary_contact: BoundaryContact = Field(
        default=BoundaryContact.CROSSES,
        description=(
            "Whether a way must cross through the feature's boundary, merely touch it (e.g. a road that "
            "dead-ends at a park's edge), or either, to count toward min_area_exits."
        ),
    )
    area_corridor_m: float = Field(
        default=50,
        gt=0,
        le=500,
        description="How close the route must pass to the area feature to count as going through it",
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
            raise ValueError(
                "through_categories or through_raw_tags is required when min_area_m2/min_area_exits is set"
            )
        return self


class RouteSearchMatch(CamelModel):
    """One candidate route that satisfied every criterion in a RouteSearchCriteria search."""

    route: Route
    matched_area: AreaMatch | None = Field(
        default=None, description="The qualifying area feature the route passes through, when area criteria were set"
    )


class AreaSearchRequest(_PoiTagFields):
    """Find OSM features of any category (restaurants, bus stops, police stations, parks, lakes, ...) within a scope, independent of any route.

    Not just polygon "area" features — most categories are single points in OSM, and come back
    that way (see AreaMatch); a smaller set (parks, lakes, malls, bases, etc.) are polygons and
    come back with their real boundary, area_m2, and exit_count. Unlike RouteSearchCriteria's
    through_* fields (which check whether a *planned route* passes through a qualifying polygon
    feature — a much stricter, often-empty condition, since most routes go around a park rather
    than through it), this searches for every matching feature within the scope directly — e.g.
    "show me all parks within 5km of downtown with at least 2 trails running through them", "every
    police station in Cook County", or "restaurants and parks between Falls Church and Rosslyn".
    Scope is exactly one of: origin + radius_m (a radius around a point), boundary (everywhere
    within a polygon — a named place's administrative boundary from GeocodeResult.boundary, or a
    hand-drawn area), or origin + destination + corridor_m (a strip between two points, for
    "between A and B" — independent of any actual planned route). For a size constraint (e.g. "parks
    over 10 acres" or "parks under a quarter square mile"), set min_area_m2/max_area_m2 — convert
    the person's units to square meters yourself; either or both may be set. To narrow a prior
    result to only the ones with a real boundary meeting some condition (e.g. "just the ones a
    small road touches the edge of"), set min_boundary_count/way_types/boundary_contact — this
    only ever keeps polygon matches, since a point has no boundary to touch.
    """

    origin: Point | None = Field(
        default=None, description="Center point for a radius search, or one end of a between-two-points corridor"
    )
    radius_m: float | None = Field(
        default=None, gt=0, le=50_000, description="Search radius around origin; required for a radius search"
    )
    boundary: Polygon | MultiPolygon | None = Field(
        default=None,
        description="Search everywhere within this polygon instead of a radius, e.g. a city/county boundary or a hand-drawn area",
    )
    destination: Point | None = Field(
        default=None, description="Other end of a between-two-points corridor search; set together with origin"
    )
    corridor_m: float | None = Field(
        default=None,
        gt=0,
        le=5_000,
        description="Half-width of the corridor between origin and destination; required when destination is set",
    )
    way_types: list[str] = Field(
        default_factory=list,
        description=(
            "OSM highway= tag values that count toward min_boundary_count, e.g. ['path', 'footway', "
            "'track'] for trails/paths, or ['residential', 'service'] for small roads. Empty means "
            "every way type counts."
        ),
    )
    boundary_contact: BoundaryContact = Field(
        default=BoundaryContact.CROSSES,
        description=(
            "Whether a way must cross through the feature's boundary, merely touch it (e.g. a road that "
            "dead-ends at a park's edge), or either, to count toward min_boundary_count."
        ),
    )
    min_area_m2: float | None = Field(default=None, gt=0, description="Minimum area of the matching feature")
    max_area_m2: float | None = Field(default=None, gt=0, description="Maximum area of the matching feature")
    min_boundary_count: int | None = Field(
        default=None, ge=1, description="Minimum exit_count (see way_types/boundary_contact) of the matching feature"
    )
    limit: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def _require_exactly_one_scope(self) -> "AreaSearchRequest":
        has_destination = self.destination is not None
        has_boundary = self.boundary is not None
        has_radius = self.radius_m is not None
        if sum([has_radius, has_destination, has_boundary]) != 1:
            raise ValueError(
                "Exactly one of radius_m (a radius search), destination (a corridor search), "
                "or boundary (a polygon search) must be set"
            )
        if has_boundary:
            return self
        # Only the radius/corridor scopes pin to a point — boundary is self-contained.
        if self.origin is None:
            raise ValueError("origin is required, together with either radius_m or destination")
        if has_destination and self.corridor_m is None:
            raise ValueError("corridor_m is required when destination is set")
        return self


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


class CoverageRegion(CamelModel):
    """An area with fast, pre-compiled Valhalla tile coverage.

    Hand-curated documentation (see scripts/describe_coverage_area.py), not a build
    manifest — an area's bounds don't need to track 1:1 with whatever PBFs are actually
    registered for the tile build at any given moment.
    """

    name: str
    url: str | None = Field(default=None, description="Where this area's extract was originally downloaded from")
    bounds: Polygon = Field(description="Rectangular bounding box of the area's OSM extract")
    date_added: datetime


class RoutingCoverage(CamelModel):
    """Which regions, if any, have fast pre-compiled routing on this deployment.

    backend='networkx' means every request is routed live over a fetched OSM graph —
    slower everywhere, but with no notion of compiled regions, so regions is always empty.
    backend='valhalla' means routing is fast and in-process, but only within regions —
    a request outside every listed region will fail outright (see is_within_coverage).
    """

    backend: Literal["valhalla", "networkx"]
    regions: list[CoverageRegion] = Field(default_factory=list)
