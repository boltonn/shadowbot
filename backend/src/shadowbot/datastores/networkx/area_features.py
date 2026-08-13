"""Finds area features (parks, lakes, malls, or any other tagged polygon) along a route.

Exit counting is a heuristic: it counts distinct points where the drive/walk/bike path network
crosses a feature's outer boundary, clustering crossings within _EXIT_CLUSTER_M of each other into
one exit so a multi-lane path or two closely-tagged ways at the same gate don't get double-counted.
OSM entrance tagging is too inconsistent across feature types to rely on directly.
"""

import asyncio

import osmnx as ox
from geojson_pydantic import Point, Polygon as GeoPolygon
from geojson_pydantic.types import Position2D
from shapely.geometry import Point as ShapelyPoint, mapping, shape
from shapely.geometry.base import BaseGeometry

from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.datastores.networkx.graph_cache import get_graph_for_points
from shadowbot.datastores.networkx.osm_tags import infer_category, merged_tags, tag_entries
from shadowbot.integrations.overpass import OverpassClient
from shadowbot.schemas.poi import OsmTag, PoiCategory
from shadowbot.schemas.routing import AreaMatch, NetworkType, Route

_METERS_PER_DEGREE = 111_320
_EXIT_CLUSTER_M = 20
_AREA_GRAPH_BUFFER_M = 100


def _edge_geometry(graph, u: int, v: int, data: dict) -> BaseGeometry:
    if data.get("geometry") is not None:
        return data["geometry"]
    return shape(
        {
            "type": "LineString",
            "coordinates": [
                (graph.nodes[u]["x"], graph.nodes[u]["y"]),
                (graph.nodes[v]["x"], graph.nodes[v]["y"]),
            ],
        }
    )


def _cluster_count(points: list[ShapelyPoint], radius_deg: float) -> int:
    """Count distinct exit locations, merging any point within radius_deg of one already kept."""
    kept: list[ShapelyPoint] = []
    for point in points:
        if not any(point.distance(existing) <= radius_deg for existing in kept):
            kept.append(point)
    return len(kept)


class AreaFeatureFinder:
    """Finds tagged area features intersecting a route corridor and estimates size/exit count."""

    def __init__(self, config: NetworkXRoutingConfig, overpass_client: OverpassClient):
        self.config = config
        self.overpass_client = overpass_client

    async def find_along_route(
        self, route: Route, categories: list[PoiCategory], raw_tags: list[OsmTag], corridor_m: float
    ) -> list[AreaMatch]:
        """Find tagged polygon features the route actually crosses, with size/exit count."""
        return await asyncio.to_thread(self._find_along_route_sync, route, categories, raw_tags, corridor_m)

    def _find_along_route_sync(
        self, route: Route, categories: list[PoiCategory], raw_tags: list[OsmTag], corridor_m: float
    ) -> list[AreaMatch]:
        route_line = shape(route.geometry.model_dump(mode="json"))
        corridor = route_line.buffer(corridor_m / _METERS_PER_DEGREE)
        entries = tag_entries(categories, raw_tags)
        tags = merged_tags(entries)
        features = self.overpass_client.call_with_retry(fetch=lambda: ox.features_from_polygon(corridor, tags=tags))
        if features.empty:
            return []

        matches = []
        for _, row in features.iterrows():
            geometry = row.geometry
            if geometry.geom_type not in {"Polygon", "MultiPolygon"} or not geometry.intersects(route_line):
                continue
            outline = geometry if geometry.geom_type == "Polygon" else geometry.convex_hull
            name = row.get("name")
            matches.append(
                AreaMatch(
                    name=name if isinstance(name, str) else None,
                    category=infer_category(row, entries),
                    geometry=GeoPolygon(**mapping(outline)),
                    area_m2=self._area_m2(geometry),
                    exit_count=self._exit_count(geometry),
                )
            )
        return matches

    def _area_m2(self, geometry: BaseGeometry) -> float:
        projected, _crs = ox.projection.project_geometry(geometry)
        return projected.area

    def _exit_count(self, feature_geometry: BaseGeometry) -> int:
        west, south, east, north = feature_geometry.bounds
        bbox_points = [
            Point(type="Point", coordinates=Position2D(longitude=west, latitude=south)),
            Point(type="Point", coordinates=Position2D(longitude=east, latitude=north)),
        ]
        graph = get_graph_for_points(
            self.config,
            self.overpass_client,
            points=bbox_points,
            network_type=NetworkType.ALL,
            buffer_m=_AREA_GRAPH_BUFFER_M,
        )
        boundary = feature_geometry.boundary
        crossings: list[ShapelyPoint] = []
        for u, v, data in graph.edges(data=True):
            edge_geom = _edge_geometry(graph, u, v, data)
            if not edge_geom.crosses(boundary):
                continue
            intersection = edge_geom.intersection(boundary)
            if intersection.geom_type == "Point":
                crossings.append(intersection)
            elif intersection.geom_type == "MultiPoint":
                crossings.extend(intersection.geoms)
        return _cluster_count(crossings, radius_deg=_EXIT_CLUSTER_M / _METERS_PER_DEGREE)
