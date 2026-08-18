"""Tools exposed to the Shadowbot agent."""

from dataclasses import dataclass

import httpx
from geojson_pydantic import Point
from pydantic_ai import ModelRetry, RunContext

from shadowbot.analytics.area_search import search_areas as compute_area_search
from shadowbot.analytics.avoidance import line_between, resolve_avoid, route_geometry_line
from shadowbot.analytics.frequented_locations import apply_location_labels, compute_frequented_locations
from shadowbot.analytics.route_search import search_routes as compute_route_search
from shadowbot.datastores.base.routing import RoutingRepository
from shadowbot.datastores.networkx.area_features import AreaFeatureFinder
from shadowbot.datastores.networkx.poi import PoiRepository
from shadowbot.datastores.postgres.repositories.location_label import PostgresLocationLabelRepository
from shadowbot.datastores.postgres.repositories.point_dataset import PostgresPointDatasetRepository
from shadowbot.datastores.postgres.repositories.polygon_dataset import PostgresPolygonDatasetRepository
from shadowbot.datastores.postgres.repositories.route import PostgresRouteRepository
from shadowbot.datastores.postgres.repositories.track import PostgresTrackRepository
from shadowbot.datastores.valhalla.coverage import is_within_coverage
from shadowbot.integrations.github import build_coverage_issue_url
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.location_label import LocationLabel, LocationLabelCreate
from shadowbot.schemas.map_location import UpdateMapLocationsRequest
from shadowbot.schemas.poi import NearbyPoiRequest, Poi, RoutePoiRequest
from shadowbot.schemas.point_dataset import (
    PointDataset,
    PointDatasetAlongRouteRequest,
    PointDatasetsRequest,
    PointFeatureOnRoute,
)
from shadowbot.schemas.polygon_dataset import PolygonDataset, PolygonDatasetsRequest
from shadowbot.schemas.routing import (
    AreaMatch,
    AreaSearchRequest,
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
    RouteSearchCriteria,
    RouteSearchMatch,
    RoutingCoverage,
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
    areas: AreaFeatureFinder
    point_datasets: PostgresPointDatasetRepository
    polygon_datasets: PostgresPolygonDatasetRepository
    location_labels: PostgresLocationLabelRepository
    coverage: RoutingCoverage
    github_repo: str


def _coverage_gap_message(exc: Exception, point: Point, ctx: RunContext[AgentDeps]) -> str:
    """Turn a routing-engine failure into a ModelRetry message the model can actually act on.

    Distinguishes "this point is outside every compiled region" (the common, explainable
    case) from a genuine routing failure inside a covered region (disconnected road,
    identical origin/destination, etc.), so the model doesn't misdiagnose the latter as a
    coverage gap.
    """
    coverage = ctx.deps.coverage
    if coverage.backend == "valhalla" and not is_within_coverage(point, coverage.regions):
        covered_areas = ", ".join(r.name for r in coverage.regions) or "none yet"
        issue_url = build_coverage_issue_url(repo=ctx.deps.github_repo, point=point)
        return (
            f"No route could be computed ({exc}) — the point {point.coordinates} falls outside every region "
            f"this deployment has fast, pre-compiled routing for (currently: {covered_areas}). Tell the user "
            "routing isn't available there yet, and suggest they request it via this markdown link "
            f"(share it as-is): [request routing coverage here]({issue_url})"
        )
    return (
        f"No route could be computed ({exc}), even though the point falls within this deployment's compiled "
        "coverage — this is likely a genuine routing issue (e.g. a disconnected road, or identical origin/"
        "destination), not a missing region. Say routing failed for this specific request rather than blaming "
        "missing coverage."
    )


async def geocode(ctx: RunContext[AgentDeps], query: str) -> list[GeocodeResult]:
    """Resolve a place name into coordinates via Nominatim's structured address search.

    Format query as "<name>, <city>, <state/region>, <country>" — e.g. "Whole Foods
    Market, Tysons, VA, USA" rather than "Whole Foods in Tysons, VA". Drop connector
    words like "in"/"near"/"at" unless they're actually part of the name itself (e.g.
    "The Standard at Columbia"). Always include the country when it's known or inferable
    from context (the conversation so far, a prior geocode result, an existing route) —
    Nominatim matches far less reliably without it, especially for chain/business names
    that exist in multiple countries.
    """
    try:
        return await ctx.deps.geocoder.geocode(GeocodeRequest(query=query))
    except httpx.HTTPError as exc:
        raise ModelRetry(
            f"The geocoding service failed for {query!r} ({exc}). Wait a moment and try again, or tell "
            "the user the geocoder is temporarily unavailable if it keeps failing."
        ) from exc


async def plan_route(ctx: RunContext[AgentDeps], request: RouteRequest) -> Route:
    """Plan a route between an origin and destination, honoring any avoidance constraints.

    Pass ordered stops (e.g. a gas station found via find_poi_along_route) via
    request.waypoints for a single continuous multi-stop route, rather than
    planning separate legs and stitching them together yourself. To actually route around an
    uploaded point dataset's features (e.g. 'avoid known camera locations'), rather than just
    reporting them, set request.avoid.avoid_point_datasets — don't just call
    find_point_dataset_along_route and describe the count, since that never changes the route.
    """
    resolved_avoid = await resolve_avoid(
        request.avoid, line_between(request.origin, request.destination), ctx.deps.point_datasets
    )
    request = request.model_copy(update={"avoid": resolved_avoid})
    try:
        route = await ctx.deps.routing.compute_route(request)
    except ValueError as exc:
        raise ModelRetry(_coverage_gap_message(exc, request.destination, ctx)) from exc
    return await ctx.deps.routes.add_route(route)


async def search_routes(ctx: RunContext[AgentDeps], request: RouteSearchCriteria) -> list[RouteSearchMatch]:
    """Generate candidate routes between an origin and destination and keep only those matching every criterion.

    Use this instead of plan_route when the person describes constraints a single planned route
    can't express directly — travel mode, named places/roads to avoid (geocoded automatically),
    an uploaded point dataset's features to avoid (request.avoid.avoid_point_datasets — see
    plan_route's docstring), and/or passing through an area feature (a park, lake, mall, etc., via
    request.through_categories/through_raw_tags — same OSM tagging convention as find_nearby_poi)
    that meets a minimum size and/or a minimum number of boundary crossings ("exits"). Each
    returned match's route is already planned and persisted, ready to pass to reroute/
    compare_routes/estimate_arrival like any other. An empty result means no candidate satisfied
    every criterion — say so rather than relaxing the request's criteria yourself.
    """
    return await compute_route_search(
        request,
        routing=ctx.deps.routing,
        routes=ctx.deps.routes,
        areas=ctx.deps.areas,
        geocoder=ctx.deps.geocoder,
        point_datasets=ctx.deps.point_datasets,
    )


async def find_area_features(ctx: RunContext[AgentDeps], request: AreaSearchRequest) -> list[AreaMatch]:
    """Find OSM features of any category — restaurants, bus stops, police stations, parks, lakes, bases, etc. — within a scope, independent of any route.

    Use this for open-ended "show me all X near/in/between ..." requests, for any category, not
    just polygon "area" features — most categories (restaurants, bus stops, police stations, ...)
    come back as points; a smaller set (parks, lakes, malls, bases, ...) come back as polygons with
    a real boundary, area_m2, and exit_count (see AreaMatch). Unlike search_routes'
    through_categories/through_raw_tags (which only count a match when an already-*planned route*
    physically crosses that polygon — a much stricter, often-empty condition since most routes go
    around a park rather than through it), this searches for every matching feature within the
    scope directly, whether or not any route has been or will be planned.

    Scope is exactly one of:
    - request.origin + request.radius_m — "near a point".
    - request.boundary — "anywhere within this area". Geocode the place first and pass its
      GeocodeResult.boundary when the person names a city/county/park/etc. rather than
      approximating it with a radius; only fall back to origin/radius_m when geocode returns no
      boundary for that place (e.g. it's an address or POI, not an administrative/area feature).
    - request.origin + request.destination + request.corridor_m — "between A and B" (e.g. "parks
      between Falls Church and Rosslyn"). Geocode both places first. Use this scope for "between"/
      "along the way from X to Y" phrasing even when no route has been planned or asked for — don't
      reach for search_routes just because two places were named; that tool is for routing
      decisions, not for listing what's in the area between two points.

    Configure request.way_types (OSM highway= tag values, e.g. ['path', 'footway', 'track'] for
    trails/paths, or ['residential', 'service'] for small roads — same OSM tagging convention as
    find_nearby_poi's raw_tags) and request.boundary_contact (crosses/touches/any) to control what
    counts toward request.min_boundary_count (a feature's returned exit_count). Setting
    min_area_m2/min_boundary_count narrows a result to only its polygon matches (e.g. "just the
    parks with a small road touching their edge") — a point match never satisfies either, since it
    has no area or boundary. Results are ranked with polygon matches first (largest area first),
    then point matches. An empty result means nothing matched — say so rather than relaxing the
    request's criteria yourself.
    """
    return await compute_area_search(request, areas=ctx.deps.areas)


async def reroute(ctx: RunContext[AgentDeps], route_id: str, request: RerouteRequest) -> Route:
    """Recompute a previously planned route with new avoidance constraints and/or a new stop list.

    To add or remove a stop on an existing route, geocode the place if needed, then pass
    request.waypoints as the prior route's waypoints (visible on the earlier Route output)
    with the stop inserted/removed at the desired position — omit request.waypoints to leave
    stops unchanged when only adjusting avoidance constraints. To actually route around an
    uploaded point dataset's features (e.g. 'avoid known camera locations'), rather than just
    reporting them, set request.avoid.avoid_point_datasets.
    """
    prior_route = await ctx.deps.routes.get_route_by_id(route_id)
    if prior_route is None:
        raise ModelRetry(f"No route found with id {route_id!r}. Double-check the id, or plan_route again if needed.")
    resolved_avoid = await resolve_avoid(
        request.avoid, route_geometry_line(prior_route.geometry), ctx.deps.point_datasets
    )
    request = request.model_copy(update={"avoid": resolved_avoid})
    try:
        new_route = await ctx.deps.routing.compute_reroute(prior_route, request)
    except ValueError as exc:
        raise ModelRetry(_coverage_gap_message(exc, prior_route.destination, ctx)) from exc
    return await ctx.deps.routes.add_route(new_route)


async def compare_routes(ctx: RunContext[AgentDeps], route_id_a: str, route_id_b: str) -> RouteComparison:
    """Compare two previously planned routes: which is shorter/faster and how much their paths overlap.

    Use this before recommending a detour (e.g. for a gas stop) so 'is it worth it'
    has a real answer instead of a guess.
    """
    route_a = await ctx.deps.routes.get_route_by_id(route_id_a)
    route_b = await ctx.deps.routes.get_route_by_id(route_id_b)
    if route_a is None:
        raise ModelRetry(f"No route found with id {route_id_a!r}. Double-check the id, or plan_route again if needed.")
    if route_b is None:
        raise ModelRetry(f"No route found with id {route_id_b!r}. Double-check the id, or plan_route again if needed.")
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
    try:
        return await ctx.deps.routing.compute_isochrone(request)
    except ValueError as exc:
        raise ModelRetry(_coverage_gap_message(exc, request.origin, ctx)) from exc


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
        raise ModelRetry(f"No track found with id {track_id!r}. Call list_tracks to see valid ids.")
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

    The home/work guess comes from request.classification, which assumes a typical
    daytime schedule — adjust its time windows when the person describes something
    else (night shift, remote work, etc.) rather than trusting a guess that doesn't
    fit. A returned location's category/name may reflect a prior correction saved via
    save_location_label rather than the heuristic guess.
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

    locations = compute_frequented_locations(
        points_by_track,
        radius_m=request.radius_m,
        min_dwell_s=request.min_dwell_s,
        min_visits=request.min_visits,
        limit=request.limit,
        rule=request.classification,
    )
    saved_labels = await ctx.deps.location_labels.get_location_labels()
    return apply_location_labels(locations, saved_labels, radius_m=request.radius_m)


async def save_location_label(ctx: RunContext[AgentDeps], request: LocationLabelCreate) -> LocationLabel:
    """Save a person's correction or name for a frequented location, e.g. 'that's the gym'.

    Call this immediately whenever the person corrects, disagrees with, or supplies a name
    for a location from a prior find_frequented_locations result — replying in text alone
    ("noted", "I'll remember that") does not persist anything; only this call does. Pass the
    exact geometry of the location being labeled from that prior result, not a re-geocoded
    point. Future find_frequented_locations calls automatically apply the label to anything
    within that call's radius_m of the saved point, overriding the home/work/unknown guess.
    """
    return await ctx.deps.location_labels.save_location_label(request)


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
    call list_point_datasets first if you don't already know the right dataset_id; its response
    also lists each dataset's actual tags (e.g. 'indoor', 'verified'). If the person qualifies the
    request with a distinction those tags capture (e.g. 'avoid the indoor ones', 'only the verified
    cameras'), use request.include_tags/exclude_tags to honor it rather than silently ignoring the
    qualifier and returning every feature regardless of it.
    """
    route = await ctx.deps.routes.get_route_by_id(route_id)
    if route is None:
        raise ValueError(f"Route not found: {route_id}")
    return await ctx.deps.point_datasets.find_along_route(dataset_id, route, request)


async def list_polygon_datasets(ctx: RunContext[AgentDeps]) -> list[PolygonDataset]:
    """List previously uploaded custom polygon datasets (e.g. school zones, restricted areas, boundaries)."""
    result = await ctx.deps.polygon_datasets.get_polygon_datasets(PolygonDatasetsRequest())
    return result.data


async def update_map_locations(request: UpdateMapLocationsRequest) -> UpdateMapLocationsRequest:
    """Control what location markers are currently shown on the user's map, alongside the chat.

    This is the only way search results become visible on the map — geocode, find_nearby_poi,
    find_poi_along_route, find_area_features, find_frequented_locations,
    find_point_dataset_along_route, and save_location_label all return data to you, but plotting
    it is a separate, deliberate step via this tool. Call it whenever a location-surfacing tool's
    results are worth showing:

    - action="replace": clear everything currently on the map and show exactly `locations`
      instead. Use this for a new search/topic change, or when the person's follow-on message
      narrows or filters what should be shown (e.g. "just the ones open late" — call again with
      only the matching subset).
    - action="add": keep everything currently on the map and add `locations` on top of it. Use
      when the new results complement what's already shown rather than replacing it.
    - action="remove": keep everything except `remove_ids`. Use when the person asks to drop
      specific results (e.g. "remove the one downtown", "take off the gas stations").

    Assign each location a stable, human-legible `id` (e.g. a slug of its name) so you can refer
    back to it in a later remove call.

    Always fill in `properties` with whatever raw detail the source tool gave you (geocode's
    osm_type/osm_id/osm_class/url/address; find_nearby_poi's/find_poi_along_route's osm_type/
    osm_id/url/raw_tags; an AreaMatch's osm_type/osm_id/url/raw_tags from find_area_features or
    search_routes' through_categories/through_raw_tags) — flatten nested fields to string
    key/value pairs. The user can open a marker to inspect this, so don't summarize it away to
    just a name and a pin.

    `locations[].geometry` accepts either a Point or a Polygon — pass an AreaMatch's geometry
    (from find_area_features or search_routes' matched_area) exactly as returned: most matches are
    already a Point, and a polygon match (a park, lake, mall, etc.) should be passed as its actual
    Polygon rather than flattened to a centroid, so the user sees its real shape and extent on the
    map. Carry its osm_type/osm_id into `properties` either way, so later in the conversation you
    (or the user) can refer back to that exact feature by id rather than re-searching by name. Planned
    routes are a different, already-automatic thing: plan_route/
    reroute/search_routes results are drawn on the map on their own the moment you return them,
    so never pass a route's LineString geometry here, and don't call this tool again just to
    "add" a route you already planned.
    """
    return request


async def get_routing_coverage(ctx: RunContext[AgentDeps]) -> RoutingCoverage:
    """Which regions, if any, have fast, pre-compiled routing on this deployment.

    Call this before confidently promising fast routing/POI results somewhere the person
    hasn't already successfully routed within this conversation, or whenever they ask
    directly whether an area is supported ("do you cover Seattle?"). backend='networkx'
    means every request is routed live, everywhere, just slower — there's no notion of
    covered regions in that mode. backend='valhalla' means routing is fast but only inside
    `regions`; use suggest_coverage_request_url to offer requesting an area outside them.
    """
    return ctx.deps.coverage


async def suggest_coverage_request_url(
    ctx: RunContext[AgentDeps], place: str, point: Point | None = None
) -> str:
    """A ready-to-share link to request fast routing coverage for a place outside current regions.

    Call this once you've told the person a location isn't within this deployment's compiled
    coverage (via get_routing_coverage, or a routing/isochrone failure) and want to offer them
    a concrete next step. Pass the place name they used, and its coordinates if you geocoded it.
    Share the returned URL as-is, formatted as a markdown link (e.g. "[request coverage for
    Seattle](<url>)") so it renders clickable — don't hand-build the URL yourself, since the
    title/body encoding has to be exact.
    """
    return build_coverage_issue_url(repo=ctx.deps.github_repo, place=place, point=point)
