"""Fetch-on-demand, cache-to-disk loader for OSM road network tiles.

Scoped to what each request actually needs (a bounding box around its
origin/destination/waypoints) rather than one large pre-configured region —
fetching an entire state/region upfront gets split into dozens of Overpass
sub-queries and can take a very long time (or fail) before the first request
is ever served. Tiles are snapped to a grid so nearby requests reuse the same
cached fetch instead of re-fetching a near-identical area.
"""

import hashlib
import math
from functools import lru_cache

import networkx as nx
import osmnx as ox
from geojson_pydantic import Point
from loguru import logger

from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.integrations.overpass import OverpassClient

_METERS_PER_DEGREE = 111_320
_TILE_DEGREES = 0.1  # ~11km grid — requests within the same tile reuse one cached fetch


def _bbox_for(points: list[Point], buffer_m: float) -> tuple[float, float, float, float]:
    """A (west, south, east, north) bbox covering the points plus a buffer, snapped to the tile grid."""
    lons = [p.coordinates[0] for p in points]
    lats = [p.coordinates[1] for p in points]
    buffer_deg = buffer_m / _METERS_PER_DEGREE
    west = _TILE_DEGREES * ((min(lons) - buffer_deg) // _TILE_DEGREES)
    south = _TILE_DEGREES * ((min(lats) - buffer_deg) // _TILE_DEGREES)
    east = _TILE_DEGREES * ((max(lons) + buffer_deg) // _TILE_DEGREES + 1)
    north = _TILE_DEGREES * ((max(lats) + buffer_deg) // _TILE_DEGREES + 1)
    return (west, south, east, north)


def _bbox_slug(bbox: tuple[float, float, float, float], network_type: str) -> str:
    digest = hashlib.sha1(f"{bbox}-{network_type}".encode()).hexdigest()[:16]
    return f"tile-{digest}"


def _is_missing(value: object) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def _finalize_graph(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    """Impute speeds/travel times, tolerating the data gaps a real-world extract has.

    Ways clipped at a query boundary (or an entire highway type with zero tagged
    speeds to average) can leave edges with no computed length or a NaN speed_kph —
    add_edge_speeds' own fallback only covers highway types it doesn't recognize at
    all, not ones present but averaging to NaN. add_edge_travel_times raises on
    either gap, so it's safer to drop those few unusable edges than fail the whole
    graph over them.
    """
    graph = ox.routing.add_edge_speeds(graph, fallback=30)
    for _, _, data in graph.edges(data=True):
        if _is_missing(data.get("speed_kph")):
            data["speed_kph"] = 30.0
    broken_edges = [
        (u, v, k)
        for u, v, k, data in graph.edges(keys=True, data=True)
        if _is_missing(data.get("length")) or _is_missing(data.get("speed_kph"))
    ]
    if broken_edges:
        logger.warning(f"Dropping {len(broken_edges)} edges with missing length/speed data")
        graph.remove_edges_from(broken_edges)
    return ox.routing.add_edge_travel_times(graph)


@lru_cache(maxsize=64)
def _get_graph_for_bbox(
    config: NetworkXRoutingConfig,
    overpass_client: OverpassClient,
    bbox: tuple[float, float, float, float],
    network_type: str,
) -> nx.MultiDiGraph:
    config.cache_dir.mkdir(parents=True, exist_ok=True)
    graph_path = config.cache_dir / f"{_bbox_slug(bbox, network_type)}.graphml"

    if graph_path.exists():
        logger.info(f"Loading cached OSM graph tile from {graph_path}")
        return ox.load_graphml(graph_path)

    logger.info(
        f"Fetching OSM graph tile {bbox} ({network_type}) via Overpass "
        f"({overpass_client.config.overpass_url}) — first request in this area, may take a moment"
    )
    graph = overpass_client.call_with_retry(fetch=lambda: ox.graph_from_bbox(bbox, network_type=network_type))
    graph = _finalize_graph(graph)
    ox.save_graphml(graph, graph_path)
    logger.info(f"Cached OSM graph tile to {graph_path}")
    return graph


def get_graph_for_points(
    config: NetworkXRoutingConfig,
    overpass_client: OverpassClient,
    points: list[Point],
    network_type: str,
    buffer_m: float = 3_000,
) -> nx.MultiDiGraph:
    """Return a road network graph covering the given points, fetching only the area actually needed."""
    bbox = _bbox_for(points, buffer_m)
    return _get_graph_for_bbox(config, overpass_client, bbox, network_type)
