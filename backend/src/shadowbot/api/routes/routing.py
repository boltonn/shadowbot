from fastapi import APIRouter, HTTPException

from shadowbot.api.deps.postgres import RouteDatastoreDep
from shadowbot.api.deps.routing import RoutingDatastoreDep
from shadowbot.api.settings import Settings
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.routing import GeocodeRequest, GeocodeResult, RerouteRequest, Route, RouteRequest

router = APIRouter(tags=["routing"])
settings = Settings()
nominatim_client = NominatimClient(config=settings.geocoding)


@router.post("/geocode")
async def geocode(request: GeocodeRequest) -> list[GeocodeResult]:
    """Resolve a free-text place query into candidate locations."""
    return await nominatim_client.geocode(request)


@router.post("/routes")
async def create_route(request: RouteRequest, routing: RoutingDatastoreDep, routes: RouteDatastoreDep) -> Route:
    """Plan a route between two points, respecting any avoidance constraints."""
    try:
        route = await routing.compute_route(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await routes.add_route(route)


@router.post("/routes/{route_id}/reroute")
async def reroute(
    route_id: str, request: RerouteRequest, routing: RoutingDatastoreDep, routes: RouteDatastoreDep
) -> Route:
    """Recompute a prior route with additional avoidance constraints."""
    prior_route = await routes.get_route_by_id(route_id)
    if prior_route is None:
        raise HTTPException(status_code=404, detail=f"Route not found: {route_id}")
    try:
        new_route = await routing.compute_reroute(prior_route, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await routes.add_route(new_route)
