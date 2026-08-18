"""Resolves higher-level avoidance inputs into AvoidancePreferences.exclude_polygons.

Named places and uploaded point-dataset features are both resolved down to the routing engine's
only real avoidance primitive. Shared by plan_route, reroute, and search_routes so 'avoid <named
place>' and 'avoid <point dataset features>' behave the same way everywhere a route gets computed.
"""

from geojson_pydantic import LineString, Point, Polygon
from shapely.geometry import LineString as ShapelyLineString, mapping, shape
from shapely.geometry.base import BaseGeometry

from shadowbot.datastores.postgres.repositories.point_dataset import PostgresPointDatasetRepository
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.point_dataset import PointDatasetAvoidance
from shadowbot.schemas.routing import AvoidancePreferences, GeocodeRequest

_METERS_PER_DEGREE = 111_320


def line_between(origin: Point, destination: Point) -> BaseGeometry:
    """A straight line between two points, for scoping avoidance before any route is computed."""
    return ShapelyLineString([tuple(origin.coordinates[:2]), tuple(destination.coordinates[:2])])


def route_geometry_line(geometry: LineString) -> BaseGeometry:
    """A previously computed route's actual path, for scoping avoidance more precisely on reroute."""
    return shape(geometry.model_dump(mode="json"))


async def resolve_avoid_places(geocoder: NominatimClient, places: list[str], radius_m: float) -> list[Polygon]:
    """Buffer each geocoded named place/road into an exclusion polygon."""
    polygons = []
    for place in places:
        results = await geocoder.geocode(GeocodeRequest(query=place, limit=1))
        if not results:
            continue
        buffered = shape(results[0].geometry.model_dump(mode="json")).buffer(radius_m / _METERS_PER_DEGREE)
        polygons.append(Polygon(**mapping(buffered)))
    return polygons


async def resolve_avoid_point_datasets(
    point_datasets: PostgresPointDatasetRepository,
    avoidances: list[PointDatasetAvoidance],
    line: BaseGeometry,
) -> list[Polygon]:
    """Buffer every point-dataset feature matching each avoidance entry into an exclusion polygon."""
    polygons = []
    for avoidance in avoidances:
        points = await point_datasets.find_near_line(
            avoidance.dataset_id,
            line=line,
            corridor_m=avoidance.corridor_m,
            category=avoidance.category,
            include_tags=avoidance.include_tags,
            exclude_tags=avoidance.exclude_tags,
            limit=500,
        )
        for point in points:
            buffered = shape(point.geometry.model_dump(mode="json")).buffer(avoidance.buffer_m / _METERS_PER_DEGREE)
            polygons.append(Polygon(**mapping(buffered)))
    return polygons


async def resolve_avoid(
    avoid: AvoidancePreferences,
    line: BaseGeometry,
    point_datasets: PostgresPointDatasetRepository,
    geocoder: NominatimClient | None = None,
    avoid_places: list[str] | None = None,
    avoid_radius_m: float = 300,
) -> AvoidancePreferences:
    """Merge every avoidance source into one exclude_polygons list the routing engine can use.

    Sources: drawn polygons (already on avoid.exclude_polygons), named places, and point-dataset
    features.
    """
    extra: list[Polygon] = []
    if avoid.avoid_point_datasets:
        extra += await resolve_avoid_point_datasets(point_datasets, avoid.avoid_point_datasets, line)
    if avoid_places and geocoder:
        extra += await resolve_avoid_places(geocoder, avoid_places, avoid_radius_m)
    if not extra:
        return avoid
    return avoid.model_copy(update={"exclude_polygons": [*avoid.exclude_polygons, *extra]})
