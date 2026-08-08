"""NetworkX-based routing backend: pure-Python shortest path over a cached OSM graph."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import networkx as nx
import osmnx as ox
from geojson_pydantic import LineString, Point, Polygon
from shapely import concave_hull
from shapely.geometry import LineString as ShapelyLineString, MultiPoint, mapping, shape

from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.datastores.networkx.graph_cache import get_graph_for_points
from shadowbot.schemas.routing import (
    ArrivalEstimate,
    AvoidancePreferences,
    Isochrone,
    IsochroneRequest,
    RerouteRequest,
    Route,
    RouteComparison,
    RouteRequest,
)

_HIGHWAY_AVOID_TYPES = {"motorway", "motorway_link", "trunk", "trunk_link"}
_UNPAVED_SURFACES = {"unpaved", "gravel", "dirt", "ground", "earth"}
_REROUTE_BUFFER_DEGREES = 0.0003  # ~30m; good enough without a projected-CRS round trip for a single-region prototype
_ROUTE_GRAPH_BUFFER_M = 3_000  # margin beyond the requested points, so nearby detours don't need a re-fetch
_ISOCHRONE_MAX_SPEED_MPS = 28  # ~100 km/h; a deliberately generous highway-speed upper bound for sizing the fetch area


def _congestion_multiplier(departure: datetime) -> float:
    """A static time-of-day/day-of-week heuristic — there's no live traffic feed to draw on.

    Weekday rush hours get the biggest bump, weekday midday a smaller one, and
    weekends a small bump around typical errand-running hours. Everything else
    is treated as free-flow.
    """
    is_weekday = departure.weekday() < 5
    hour = departure.hour
    if is_weekday:
        if 7 <= hour < 9:
            return 1.4
        if 16 <= hour < 18:
            return 1.5
        if 9 <= hour < 16:
            return 1.1
        return 1.0
    if 11 <= hour < 15:
        return 1.15
    return 1.0


def _as_list(value) -> list:
    return value if isinstance(value, list) else [value]


def _is_truthy(value) -> bool:
    if isinstance(value, list):
        return any(_is_truthy(v) for v in value)
    return str(value).lower() in {"yes", "true", "1"}


def _edge_geometry(graph: nx.MultiDiGraph, u: int, v: int, data: dict) -> ShapelyLineString:
    if data.get("geometry") is not None:
        return data["geometry"]
    return ShapelyLineString(
        [(graph.nodes[u]["x"], graph.nodes[u]["y"]), (graph.nodes[v]["x"], graph.nodes[v]["y"])]
    )


class NetworkXRoutingRepository:
    """Routing backend that computes shortest paths over a locally cached OSM graph."""

    def __init__(self, config: NetworkXRoutingConfig):
        self.config = config

    async def compute_route(self, request: RouteRequest) -> Route:
        """Compute a new route between the request's origin and destination."""
        return await asyncio.to_thread(self._compute_route_sync, request)

    async def compute_reroute(self, route: Route, request: RerouteRequest) -> Route:
        """Recompute a prior route, optionally excluding the prior route's own path."""
        avoid = request.avoid.model_copy(deep=True)
        if request.avoid_prior_route:
            buffered = shape(route.geometry.model_dump(mode="json")).buffer(_REROUTE_BUFFER_DEGREES)
            avoid.exclude_polygons.append(Polygon(**mapping(buffered)))
        new_request = RouteRequest(
            origin=route.origin,
            destination=route.destination,
            waypoints=route.waypoints,
            network_type=route.network_type,
            avoid=avoid,
        )
        return await self.compute_route(new_request)

    async def compare_routes(self, route_a: Route, route_b: Route) -> RouteComparison:
        """Diff two previously computed routes: which is shorter/faster, and how much they overlap."""
        return await asyncio.to_thread(self._compare_routes_sync, route_a, route_b)

    def _compare_routes_sync(self, route_a: Route, route_b: Route) -> RouteComparison:
        line_a = shape(route_a.geometry.model_dump(mode="json"))
        line_b = shape(route_b.geometry.model_dump(mode="json"))
        a_within_b = line_a.intersection(line_b.buffer(_REROUTE_BUFFER_DEGREES)).length
        b_within_a = line_b.intersection(line_a.buffer(_REROUTE_BUFFER_DEGREES)).length
        total_length = line_a.length + line_b.length
        shared_fraction = (a_within_b + b_within_a) / total_length if total_length else 0.0
        return RouteComparison(
            route_a_id=route_a.id,
            route_b_id=route_b.id,
            distance_delta_m=route_b.distance_m - route_a.distance_m,
            duration_delta_s=route_b.duration_s - route_a.duration_s,
            shared_path_fraction=shared_fraction,
        )

    async def estimate_arrival(self, route: Route, date_departure: datetime) -> ArrivalEstimate:
        """Estimate arrival time by applying a time-of-day congestion heuristic to a route's duration."""
        multiplier = _congestion_multiplier(date_departure)
        estimated_duration_s = route.duration_s * multiplier
        return ArrivalEstimate(
            route_id=route.id,
            date_departure=date_departure,
            date_arrival=date_departure + timedelta(seconds=estimated_duration_s),
            free_flow_duration_s=route.duration_s,
            estimated_duration_s=estimated_duration_s,
            congestion_multiplier=multiplier,
        )

    async def compute_isochrone(self, request: IsochroneRequest) -> Isochrone:
        """Compute the reachable area from a point within a time budget, over the road network."""
        return await asyncio.to_thread(self._compute_isochrone_sync, request)

    def _compute_isochrone_sync(self, request: IsochroneRequest) -> Isochrone:
        # Generously-sized so the whole reachable area is covered without under-fetching;
        # snapped to the same tile grid as everything else so overlapping requests reuse it.
        isochrone_buffer_m = request.minutes * 60 * _ISOCHRONE_MAX_SPEED_MPS
        graph = get_graph_for_points(
            self.config, points=[request.origin], network_type=request.network_type, buffer_m=isochrone_buffer_m
        )
        weight_fn = self._make_weight_fn(graph, request.avoid)
        lon, lat = request.origin.coordinates[:2]
        origin_node = ox.distance.nearest_nodes(graph, X=lon, Y=lat)

        cutoff_s = request.minutes * 60
        reachable = nx.single_source_dijkstra_path_length(graph, origin_node, cutoff=cutoff_s, weight=weight_fn)
        points = [(graph.nodes[n]["x"], graph.nodes[n]["y"]) for n in reachable]

        if len(points) < 4:
            # Not enough reachable nodes for a meaningful hull (tiny time budget, edge of graph).
            hull = shape({"type": "Point", "coordinates": (lon, lat)}).buffer(0.001)
        else:
            hull = concave_hull(MultiPoint(points), ratio=0.3)
            if hull.geom_type != "Polygon":
                hull = hull.convex_hull

        return Isochrone(
            origin=request.origin,
            minutes=request.minutes,
            geometry=Polygon(**mapping(hull)),
            reachable_node_count=len(points),
        )

    def _compute_route_sync(self, request: RouteRequest) -> Route:
        stops = [request.origin, *request.waypoints, request.destination]
        graph = get_graph_for_points(
            self.config, points=stops, network_type=request.network_type, buffer_m=_ROUTE_GRAPH_BUFFER_M
        )
        weight_fn = self._make_weight_fn(graph, request.avoid)

        coords: list[tuple[float, float]] = []
        distance_m = 0.0
        duration_s = 0.0
        for leg_origin, leg_destination in zip(stops[:-1], stops[1:], strict=True):
            leg_geometry, leg_distance_m, leg_duration_s = self._compute_leg(
                graph, weight_fn, leg_origin, leg_destination
            )
            leg_coords = list(leg_geometry.coordinates)
            if coords and coords[-1] == leg_coords[0]:
                leg_coords = leg_coords[1:]
            coords.extend(leg_coords)
            distance_m += leg_distance_m
            duration_s += leg_duration_s

        return Route(
            id=str(uuid4()),
            geometry=LineString(type="LineString", coordinates=coords),
            distance_m=distance_m,
            duration_s=duration_s,
            origin=request.origin,
            destination=request.destination,
            waypoints=request.waypoints,
            network_type=request.network_type,
            avoid=request.avoid,
            date_created=datetime.now(UTC),
        )

    def _compute_leg(
        self, graph: nx.MultiDiGraph, weight_fn, leg_origin: Point, leg_destination: Point
    ) -> tuple[LineString, float, float]:
        orig_lon, orig_lat = leg_origin.coordinates[:2]
        dest_lon, dest_lat = leg_destination.coordinates[:2]
        orig_node = ox.distance.nearest_nodes(graph, X=orig_lon, Y=orig_lat)
        dest_node = ox.distance.nearest_nodes(graph, X=dest_lon, Y=dest_lat)
        try:
            node_path = nx.shortest_path(graph, orig_node, dest_node, weight=weight_fn, method="dijkstra")
        except nx.NetworkXNoPath as exc:
            raise ValueError(
                f"No route found between {leg_origin.coordinates} and {leg_destination.coordinates} "
                "under the given avoidance constraints"
            ) from exc
        return self._build_geometry(graph, node_path)

    def _make_weight_fn(self, graph: nx.MultiDiGraph, avoid: AvoidancePreferences):
        exclude_shapes = [shape(polygon.model_dump(mode="json")) for polygon in avoid.exclude_polygons]

        def edge_cost(u, v, data: dict) -> float:
            highways = _as_list(data.get("highway"))
            if avoid.avoid_tolls and _is_truthy(data.get("toll")):
                return float("inf")
            if avoid.avoid_highways and any(h in _HIGHWAY_AVOID_TYPES for h in highways):
                return float("inf")
            if avoid.avoid_unpaved and data.get("surface") in _UNPAVED_SURFACES:
                return float("inf")
            if avoid.avoid_ferries and "ferry" in highways:
                return float("inf")
            if exclude_shapes:
                edge_geom = _edge_geometry(graph, u, v, data)
                if any(edge_geom.intersects(polygon) for polygon in exclude_shapes):
                    return float("inf")
            return data.get("travel_time", data.get("length", 1.0))

        def weight(u, v, parallel_edges: dict) -> float:
            # networkx passes a MultiDiGraph's *all* parallel edges (keyed by edge key) to a
            # callable weight function, not a single edge's attribute dict — take the cheapest
            # non-excluded one, matching networkx's own convention for string-keyed weights.
            return min((edge_cost(u, v, data) for data in parallel_edges.values()), default=float("inf"))

        return weight

    def _build_geometry(
        self, graph: nx.MultiDiGraph, node_path: list[int]
    ) -> tuple[LineString, float, float]:
        coords: list[tuple[float, float]] = []
        distance_m = 0.0
        duration_s = 0.0

        for u, v in zip(node_path[:-1], node_path[1:], strict=True):
            edge_data = min(graph.get_edge_data(u, v).values(), key=lambda d: d.get("length", 0.0))
            distance_m += edge_data.get("length", 0.0)
            duration_s += edge_data.get("travel_time", 0.0)

            segment = list(_edge_geometry(graph, u, v, edge_data).coords)
            if coords and coords[-1] == segment[0]:
                segment = segment[1:]
            coords.extend(segment)

        return LineString(type="LineString", coordinates=coords), distance_m, duration_s
