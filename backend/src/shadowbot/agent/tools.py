"""Tools exposed to the Shadowbot agent."""

from dataclasses import dataclass

from pydantic_ai import RunContext

from shadowbot.analytics.frequented_locations import compute_frequented_locations
from shadowbot.datastores.networkx.poi import PoiRepository
from shadowbot.datastores.networkx.repository import NetworkXRoutingRepository
from shadowbot.datastores.postgres.repositories.route import PostgresRouteRepository
from shadowbot.datastores.postgres.repositories.track import PostgresTrackRepository
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.poi import NearbyPoiRequest, Poi, RoutePoiRequest
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
    Track,
    TrackDetail,
    TracksRequest,
)


@dataclass
class AgentDeps:
    """Dependencies injected into every agent tool call."""

    geocoder: NominatimClient
    routing: NetworkXRoutingRepository
    routes: PostgresRouteRepository
    tracks: PostgresTrackRepository
    poi: PoiRepository


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
    """Recompute a previously planned route with new avoidance constraints."""
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
    to an address, or gas stations and coffee shops together).
    """
    return await ctx.deps.poi.find_near_point(request)


async def find_poi_along_route(
    ctx: RunContext[AgentDeps], route_id: str, request: RoutePoiRequest
) -> list[Poi]:
    """Find points of interest within a corridor around a previously planned route.

    Accepts one or more categories in a single call (e.g. a gas station on the
    way, or gas and coffee together).
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
