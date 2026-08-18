"""Finds polygon area features near a point and filters them against a minimum size/boundary-count.

Shared by the REST /areas/search route and the agent's find_area_features tool, the same way
analytics/route_search.py's search_routes is shared between /routes/search and the agent tool.
"""

from shadowbot.datastores.networkx.area_features import AreaFeatureFinder
from shadowbot.schemas.routing import AreaMatch, AreaSearchRequest


async def search_areas(request: AreaSearchRequest, areas: AreaFeatureFinder) -> list[AreaMatch]:
    """Find features within request's scope (a radius, a boundary polygon, or a between-two-points corridor) matching every criterion.

    Point matches (most categories) sort after polygon matches, largest area first, since area_m2
    is meaningless for a point.
    """
    # Counting boundary contacts means fetching and parsing that feature's local road-network
    # graph — by far the slowest part of a search — so only pay for it when min_boundary_count
    # is actually set; otherwise every match just gets exit_count=None.
    compute_exit_count = request.min_boundary_count is not None
    if request.boundary is not None:
        matches = await areas.find_within_boundary(
            boundary=request.boundary,
            categories=request.categories,
            raw_tags=request.raw_tags,
            way_types=request.way_types,
            boundary_contact=request.boundary_contact,
            compute_exit_count=compute_exit_count,
        )
    elif request.destination is not None:
        assert request.origin is not None and request.corridor_m is not None
        matches = await areas.find_along_line(
            origin=request.origin,
            destination=request.destination,
            corridor_m=request.corridor_m,
            categories=request.categories,
            raw_tags=request.raw_tags,
            way_types=request.way_types,
            boundary_contact=request.boundary_contact,
            compute_exit_count=compute_exit_count,
        )
    else:
        assert request.origin is not None and request.radius_m is not None
        matches = await areas.find_near_point(
            origin=request.origin,
            radius_m=request.radius_m,
            categories=request.categories,
            raw_tags=request.raw_tags,
            way_types=request.way_types,
            boundary_contact=request.boundary_contact,
            compute_exit_count=compute_exit_count,
        )
    qualifying = [
        area
        for area in matches
        if (request.min_area_m2 is None or (area.area_m2 or 0) >= request.min_area_m2)
        and (request.min_boundary_count is None or (area.exit_count or 0) >= request.min_boundary_count)
    ]
    qualifying.sort(key=lambda area: area.area_m2 or 0, reverse=True)
    return qualifying[: request.limit]
