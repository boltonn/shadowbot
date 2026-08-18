from fastapi import APIRouter, HTTPException

from shadowbot.analytics.area_search import search_areas as compute_area_search
from shadowbot.analytics.avoidance import line_between, resolve_avoid, route_geometry_line
from shadowbot.analytics.route_search import search_routes as compute_route_search
from shadowbot.api.deps.area_features import AreaFeatureDatastoreDep
from shadowbot.api.deps.postgres import PointDatasetDatastoreDep, RouteDatastoreDep
from shadowbot.api.deps.routing import RoutingCoverageDep, RoutingDatastoreDep
from shadowbot.api.settings import Settings
from shadowbot.integrations.nominatim import NominatimClient
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
    RouteCompareRequest,
    RouteComparison,
    RouteRequest,
    RouteSearchCriteria,
    RouteSearchMatch,
    RoutingCoverage,
)

router = APIRouter(tags=["routing"])
settings = Settings()
nominatim_client = NominatimClient(config=settings.nominatim)


@router.post("/geocode")
async def geocode(request: GeocodeRequest) -> list[GeocodeResult]:
    """Resolve a free-text place query into candidate locations."""
    return await nominatim_client.geocode(request)


@router.post("/routes")
async def create_route(
    request: RouteRequest, routing: RoutingDatastoreDep, routes: RouteDatastoreDep, point_datasets: PointDatasetDatastoreDep
) -> Route:
    """Plan a route between two points, respecting any avoidance constraints."""
    resolved_avoid = await resolve_avoid(
        request.avoid, line_between(request.origin, request.destination), point_datasets
    )
    request = request.model_copy(update={"avoid": resolved_avoid})
    try:
        route = await routing.compute_route(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await routes.add_route(route)


@router.post("/routes/search")
async def search_routes(
    request: RouteSearchCriteria,
    routing: RoutingDatastoreDep,
    routes: RouteDatastoreDep,
    areas: AreaFeatureDatastoreDep,
    point_datasets: PointDatasetDatastoreDep,
) -> list[RouteSearchMatch]:
    """Generate candidate routes between two points and keep only those matching every criterion."""
    try:
        return await compute_route_search(
            request, routing=routing, routes=routes, areas=areas, geocoder=nominatim_client, point_datasets=point_datasets
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/areas/search")
async def search_areas_route(request: AreaSearchRequest, areas: AreaFeatureDatastoreDep) -> list[AreaMatch]:
    """Find polygon area features near a point, independent of any route."""
    return await compute_area_search(request, areas=areas)


@router.post("/routes/{route_id}/reroute")
async def reroute(
    route_id: str,
    request: RerouteRequest,
    routing: RoutingDatastoreDep,
    routes: RouteDatastoreDep,
    point_datasets: PointDatasetDatastoreDep,
) -> Route:
    """Recompute a prior route with additional avoidance constraints."""
    prior_route = await routes.get_route_by_id(route_id)
    if prior_route is None:
        raise HTTPException(status_code=404, detail=f"Route not found: {route_id}")
    resolved_avoid = await resolve_avoid(request.avoid, route_geometry_line(prior_route.geometry), point_datasets)
    request = request.model_copy(update={"avoid": resolved_avoid})
    try:
        new_route = await routing.compute_reroute(prior_route, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await routes.add_route(new_route)


@router.post("/routes/compare")
async def compare_routes(
    request: RouteCompareRequest, routing: RoutingDatastoreDep, routes: RouteDatastoreDep
) -> RouteComparison:
    """Compare two previously planned routes: which is shorter/faster and how much their paths overlap."""
    route_a = await routes.get_route_by_id(request.route_id_a)
    route_b = await routes.get_route_by_id(request.route_id_b)
    if route_a is None:
        raise HTTPException(status_code=404, detail=f"Route not found: {request.route_id_a}")
    if route_b is None:
        raise HTTPException(status_code=404, detail=f"Route not found: {request.route_id_b}")
    return await routing.compare_routes(route_a, route_b)


@router.post("/routes/{route_id}/arrival-estimate")
async def estimate_arrival(
    route_id: str, request: ArrivalEstimateRequest, routing: RoutingDatastoreDep, routes: RouteDatastoreDep
) -> ArrivalEstimate:
    """Estimate arrival time for a planned route given a departure time.

    This is a time-of-day/day-of-week heuristic, not live traffic.
    """
    route = await routes.get_route_by_id(route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route not found: {route_id}")
    return await routing.estimate_arrival(route, request.date_departure)


@router.post("/isochrone")
async def isochrone(request: IsochroneRequest, routing: RoutingDatastoreDep) -> Isochrone:
    """Compute the area reachable from a point within a time budget, over the real road network."""
    return await routing.compute_isochrone(request)


@router.get("/routing/coverage")
async def get_coverage(coverage: RoutingCoverageDep) -> RoutingCoverage:
    """Which regions, if any, have fast pre-compiled Valhalla routing on this deployment."""
    return coverage
