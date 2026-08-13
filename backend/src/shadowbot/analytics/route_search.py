"""Generates candidate routes and filters them against criteria the routing engine can't take directly.

Mode, structured avoidance, and named avoid-places all become routing-engine inputs (costing
options, excluded polygons). The through_* area criteria (route passes through a park, lake, mall,
etc. meeting a size/exit threshold) can't be expressed to the routing engine at all, so instead
every generated candidate (the primary route plus any Valhalla alternates) is checked against
AreaFeatureFinder after the fact, and only candidates clearing every requested threshold are
persisted and returned.
"""

from geojson_pydantic import Polygon
from shapely.geometry import mapping, shape

from shadowbot.datastores.base.routing import RoutingRepository
from shadowbot.datastores.networkx.area_features import AreaFeatureFinder
from shadowbot.datastores.postgres.repositories.route import PostgresRouteRepository
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.routing import (
    AreaMatch,
    GeocodeRequest,
    Route,
    RouteAlternate,
    RouteLeg,
    RouteRequest,
    RouteSearchCriteria,
    RouteSearchMatch,
)

_METERS_PER_DEGREE = 111_320


async def _resolve_avoid_polygons(geocoder: NominatimClient, places: list[str], radius_m: float) -> list[Polygon]:
    polygons = []
    for place in places:
        results = await geocoder.geocode(GeocodeRequest(query=place, limit=1))
        if not results:
            continue
        buffered = shape(results[0].geometry.model_dump(mode="json")).buffer(radius_m / _METERS_PER_DEGREE)
        polygons.append(Polygon(**mapping(buffered)))
    return polygons


def _alternate_to_route(primary: Route, alternate: RouteAlternate) -> Route:
    """Repackage a lighter RouteAlternate as a full, independently persistable Route."""
    return Route(
        id=alternate.id,
        geometry=alternate.geometry,
        distance_m=alternate.distance_m,
        duration_s=alternate.duration_s,
        origin=primary.origin,
        destination=primary.destination,
        waypoints=primary.waypoints,
        network_type=primary.network_type,
        avoid=primary.avoid,
        legs=[
            RouteLeg(
                origin=primary.origin,
                destination=primary.destination,
                geometry=alternate.geometry,
                distance_m=alternate.distance_m,
                duration_s=alternate.duration_s,
            )
        ],
        date_created=primary.date_created,
    )


async def _best_qualifying_area(
    areas: AreaFeatureFinder, candidate: Route, request: RouteSearchCriteria
) -> AreaMatch | None:
    found = await areas.find_along_route(
        candidate,
        categories=request.through_categories,
        raw_tags=request.through_raw_tags,
        corridor_m=request.area_corridor_m,
    )
    qualifying = [
        area
        for area in found
        if (request.min_area_m2 is None or area.area_m2 >= request.min_area_m2)
        and (request.min_area_exits is None or area.exit_count >= request.min_area_exits)
    ]
    if not qualifying:
        return None
    return max(qualifying, key=lambda area: area.area_m2)


async def search_routes(
    request: RouteSearchCriteria,
    routing: RoutingRepository,
    routes: PostgresRouteRepository,
    areas: AreaFeatureFinder,
    geocoder: NominatimClient,
) -> list[RouteSearchMatch]:
    """Generate candidate routes for request.origin/destination and keep only those matching every criterion."""
    avoid = request.avoid.model_copy(deep=True)
    avoid.exclude_polygons += await _resolve_avoid_polygons(geocoder, request.avoid_places, request.avoid_radius_m)

    primary = await routing.compute_route(
        RouteRequest(
            origin=request.origin,
            destination=request.destination,
            network_type=request.network_type,
            avoid=avoid,
            max_alternates=request.max_candidates - 1,
        )
    )
    candidates = [primary, *(_alternate_to_route(primary, alternate) for alternate in primary.alternates)]

    wants_area = request.min_area_m2 is not None or request.min_area_exits is not None
    matches = []
    for candidate in candidates:
        matched_area = None
        if wants_area:
            matched_area = await _best_qualifying_area(areas, candidate, request)
            if matched_area is None:
                continue
        persisted = await routes.add_route(candidate)
        matches.append(RouteSearchMatch(route=persisted, matched_area=matched_area))
    return matches
