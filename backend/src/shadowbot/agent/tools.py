"""Tools exposed to the Shadowbot agent."""

from dataclasses import dataclass

from pydantic_ai import ModelRetry, RunContext

from shadowbot.analytics.frequented_locations import compute_frequented_locations
from shadowbot.datastores.base.routing import RoutingRepository
from shadowbot.datastores.networkx.poi import PoiRepository
from shadowbot.datastores.postgres.repositories.point_dataset import PostgresPointDatasetRepository
from shadowbot.datastores.postgres.repositories.polygon_dataset import PostgresPolygonDatasetRepository
from shadowbot.datastores.postgres.repositories.route import PostgresRouteRepository
from shadowbot.datastores.postgres.repositories.track import PostgresTrackRepository
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.poi import NearbyPoiRequest, Poi, RoutePoiRequest
from shadowbot.schemas.point_dataset import (
    PointDataset,
    PointDatasetAlongRouteRequest,
    PointDatasetsRequest,
    PointFeatureOnRoute,
)
from shadowbot.schemas.polygon_dataset import PolygonDataset, PolygonDatasetsRequest
from shadowbot.schemas.routing import (
    ArrivalEstimate,
    ArrivalEstimateRequest,
    GeocodeRequest,
    GeocodeResult,
    Isochrone,
    IsochroneRequest,
    RerouteRequest,
    Route,
    RouteComparison,
    RouteRequest,
)
from shadowbot.schemas.track import (
    FrequentedLocation,
    FrequentedLocationsRequest,
    MapMatchResult,
    Track,
    TrackDetail,
    TracksRequest,
)


@dataclass
class AgentDeps:
    """Dependencies injected into every agent tool call."""

    geocoder: NominatimClient
    routing: RoutingRepository
    routes: PostgresRouteRepository
    tracks: PostgresTrackRepository
    poi: PoiRepository
    point_datasets: PostgresPointDatasetRepository
    polygon_datasets: PostgresPolygonDatasetRepository


async def geocode(ctx: RunContext[AgentDeps], query: str) -> list[GeocodeResult]:
    """Resolve a free-text place name (e.g. 'Central Park') into coordinates."""
    return await ctx.deps.geocoder.geocode(GeocodeRequest(query=query))


async def plan_route(ctx: RunContext[AgentDeps], request: RouteRequest) -> Route:
    """Plan a route between an origin and destination, honoring any avoidance constraints.

    Pass ordered stops (e.g. a gas station found via find_poi_along_route) via
    request.waypoints for a single continuous multi-stop route, rather than
    planning separate legs and stitching them together yourself.
    """
    route = await ctx.deps.routing.compute_route(request)
    return await ctx.deps.routes.add_route(route)


async def reroute(ctx: RunContext[AgentDeps], route_id: str, request: RerouteRequest) -> Route:
    """Recompute a previously planned route with new avoidance constraints and/or a new stop list.

    To add or remove a stop on an existing route, geocode the place if needed, then pass
    request.waypoints as the prior route's waypoints (visible on the earlier Route output)
    with the stop inserted/removed at the desired position — omit request.waypoints to leave
    stops unchanged when only adjusting avoidance constraints.
    """
    prior_route = await ctx.deps.routes.get_route_by_id(route_id)
    if prior_route is None:
        raise ValueError(f"Route not found: {route_id}")
    new_route = await ctx.deps.routing.compute_reroute(prior_route, request)
    return await ctx.deps.routes.add_route(new_route)


async def compare_routes(ctx: RunContext[AgentDeps], route_id_a: str, route_id_b: str) -> RouteComparison:
    """Compare two previously planned routes: which is shorter/faster and how much their paths overlap.

    Use this before recommending a detour (e.g. for a gas stop) so 'is it worth it'
    has a real answer instead of a guess.
    """
    route_a = await ctx.deps.routes.get_route_by_id(route_id_a)
    route_b = await ctx.deps.routes.get_route_by_id(route_id_b)
    if route_a is None:
        raise ValueError(f"Route not found: {route_id_a}")
    if route_b is None:
        raise ValueError(f"Route not found: {route_id_b}")
    return await ctx.deps.routing.compare_routes(route_a, route_b)


async def estimate_arrival(
    ctx: RunContext[AgentDeps], route_id: str, request: ArrivalEstimateRequest
) -> ArrivalEstimate:
    """Estimate arrival time for a planned route given a departure time.

    This is a time-of-day heuristic, not live traffic — there's no real-time feed
    available offline. Say so if the user seems to expect real-time accuracy.
    """
    route = await ctx.deps.routes.get_route_by_id(route_id)
    if route is None:
        raise ValueError(f"Route not found: {route_id}")
    return await ctx.deps.routing.estimate_arrival(route, request.date_departure)


async def get_isochrone(ctx: RunContext[AgentDeps], request: IsochroneRequest) -> Isochrone:
    """Compute the area reachable from a point within a time budget, over the real road network.

    Use this for open-ended 'what's within N minutes of home' browsing, as opposed
    to routing to one specific already-known destination.
    """
    return await ctx.deps.routing.compute_isochrone(request)


async def find_nearby_poi(ctx: RunContext[AgentDeps], request: NearbyPoiRequest) -> list[Poi]:
    """Find the closest points of interest to a location.

    Accepts one or more categories in a single call (e.g. the closest supermarket
    to an address, or gas stations and coffee shops together). Ranked by real drive
    time when the Valhalla routing backend is active, straight-line distance otherwise.

    request.categories only covers common, curated types. For anything else (parks,
    museums, dog parks, bike shops, etc.) pass request.raw_tags with the matching OSM
    key/value tag instead — don't tell the user a search isn't supported just because
    it isn't in the curated category list.
    """
    routing = ctx.deps.routing
    if not routing.supports_matrix:
        return await ctx.deps.poi.find_near_point(request)

    # Overfetch by straight-line distance first — the true drive-time-closest POI isn't
    # always among the very closest by air (a river or highway median can get in the way).
    overfetch_request = request.model_copy(update={"limit": min(request.limit * 3, 20)})
    candidates = await ctx.deps.poi.find_near_point(overfetch_request)
    if not candidates:
        return candidates

    matrix = await routing.compute_matrix(origin=request.origin, destinations=[poi.geometry for poi in candidates])
    ranked = [
        poi.model_copy(update={"distance_m": entry.distance_m, "duration_s": entry.duration_s})
        if entry.distance_m is not None
        else poi
        for poi, entry in zip(candidates, matrix, strict=True)
    ]
    ranked.sort(key=lambda poi: poi.duration_s if poi.duration_s is not None else float("inf"))
    return ranked[: request.limit]


async def find_poi_along_route(ctx: RunContext[AgentDeps], route_id: str, request: RoutePoiRequest) -> list[Poi]:
    """Find points of interest within a corridor around a previously planned route.

    Accepts one or more categories in a single call (e.g. a gas station on the
    way, or gas and coffee together). As with find_nearby_poi, use request.raw_tags
    for anything outside the curated category list.
    """
    route = await ctx.deps.routes.get_route_by_id(route_id)
    if route is None:
        raise ValueError(f"Route not found: {route_id}")
    return await ctx.deps.poi.find_along_route(route, request)


async def list_tracks(ctx: RunContext[AgentDeps]) -> list[Track]:
    """List previously uploaded geo-data tracks."""
    result = await ctx.deps.tracks.get_tracks(TracksRequest())
    return result.data


async def get_track(ctx: RunContext[AgentDeps], track_id: str) -> TrackDetail | None:
    """Retrieve a track's full point history by ID."""
    return await ctx.deps.tracks.get_track_by_id(track_id)


async def match_track(ctx: RunContext[AgentDeps], track_id: str) -> MapMatchResult:
    """Snap a track's raw GPS points onto the actual roads it drove.

    Use this before reasoning about which specific roads or route a track took —
    raw points are noisy and don't line up with the road network on their own.
    Requires the Valhalla routing backend; say so if it's unavailable rather than
    guessing a road from the raw points yourself.
    """
    track = await ctx.deps.tracks.get_track_by_id(track_id)
    if track is None:
        raise ValueError(f"Track not found: {track_id}")
    if not ctx.deps.routing.supports_map_matching:
        raise ModelRetry(
            "Map matching requires the Valhalla routing backend, which isn't configured for this "
            "deployment. Tell the user this feature is unavailable here and they'll need an "
            "administrator to enable it (set VALHALLA__TILE_URI) — don't guess a road from the raw points."
        )
    return await ctx.deps.routing.match_track(track=track)


async def find_frequented_locations(
    ctx: RunContext[AgentDeps], request: FrequentedLocationsRequest
) -> list[FrequentedLocation]:
    """Find places visited more than once across the person's uploaded GPS tracks.

    Distinct visits are inferred from dwell time, not raw point density, so a long
    stop doesn't get overcounted and slowly driving past a place doesn't count at
    all. Useful for 'where do they usually go' rather than reasoning over one track.
    """
    if request.track_ids is not None:
        track_ids = request.track_ids
    else:
        summaries = await ctx.deps.tracks.get_tracks(TracksRequest(limit=200))
        track_ids = [track.id for track in summaries.data]

    points_by_track = []
    for track_id in track_ids:
        detail = await ctx.deps.tracks.get_track_by_id(track_id)
        if detail is not None:
            points_by_track.append(detail.points)

    return compute_frequented_locations(
        points_by_track,
        radius_m=request.radius_m,
        min_dwell_s=request.min_dwell_s,
        min_visits=request.min_visits,
        limit=request.limit,
    )


async def list_point_datasets(ctx: RunContext[AgentDeps]) -> list[PointDataset]:
    """List previously uploaded custom point datasets (e.g. speed cameras, hazards, or any other user-supplied POIs).

    These are distinct from find_nearby_poi/find_poi_along_route, which search OSM's
    built-in categories (gas stations, restaurants, etc.) — use this and
    find_point_dataset_along_route instead for anything the user uploaded themselves.
    """
    result = await ctx.deps.point_datasets.get_point_datasets(PointDatasetsRequest())
    return result.data


async def find_point_dataset_along_route(
    ctx: RunContext[AgentDeps], dataset_id: str, route_id: str, request: PointDatasetAlongRouteRequest
) -> list[PointFeatureOnRoute]:
    """Find features from an uploaded point dataset within a corridor around a previously planned route.

    Use this to answer questions like 'how many camera lights do I pass on this route' —
    call list_point_datasets first if you don't already know the right dataset_id.
    """
    route = await ctx.deps.routes.get_route_by_id(route_id)
    if route is None:
        raise ValueError(f"Route not found: {route_id}")
    return await ctx.deps.point_datasets.find_along_route(dataset_id, route, request)


async def list_polygon_datasets(ctx: RunContext[AgentDeps]) -> list[PolygonDataset]:
    """List previously uploaded custom polygon datasets (e.g. school zones, restricted areas, boundaries)."""
    result = await ctx.deps.polygon_datasets.get_polygon_datasets(PolygonDatasetsRequest())
    return result.data
