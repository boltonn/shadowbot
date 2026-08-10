"""Valhalla-based routing backend: in-process routing over pre-built tiles, no separate service.

Optional — only active when ROUTING__VALHALLA__TILE_URI is configured (see
datastores/valhalla/config.py and api/deps/routing.py); otherwise the pure-Python
networkx backend is used. Tiles are built once, out of band, with pyvalhalla's
bundled valhalla_build_tiles / valhalla_build_extract CLIs (see backend/README.md)
and loaded here via mmap — considerably faster per-request than networkx/osmnx
fetching and traversing a live-fetched OSM graph.
"""

import asyncio
import threading
from datetime import UTC, datetime
from uuid import uuid4

import polyline
from geojson_pydantic import LineString, Point, Polygon
from shapely.geometry import mapping, shape
from valhalla import Actor, ValhallaError
from valhalla.config import get_config

from shadowbot.datastores.base.routing import RoutingRepository
from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig
from shadowbot.datastores.valhalla.tiles import resolve_tile_path
from shadowbot.schemas.routing import (
    AvoidancePreferences,
    Isochrone,
    IsochroneRequest,
    MatrixEntry,
    NetworkType,
    Route,
    RouteAlternate,
    RouteLeg,
    RouteRequest,
)
from shadowbot.schemas.track import MapMatchResult, TrackDetail

_METERS_PER_KM = 1_000

_COSTING_BY_NETWORK_TYPE = {
    NetworkType.DRIVE: "auto",
    NetworkType.DRIVE_SERVICE: "auto",
    NetworkType.WALK: "pedestrian",
    NetworkType.BIKE: "bicycle",
    NetworkType.ALL: "auto",
}
# Valhalla rejects exclude_polygons past this total perimeter (default 10km) — user-drawn
# avoid areas and whole-route reroute buffers can easily exceed that, so raise it generously.
_MAX_EXCLUDE_POLYGONS_LENGTH_M = 2_000_000


def _costing_options(avoid: AvoidancePreferences) -> dict:
    options = {}
    if avoid.avoid_tolls:
        options["use_tolls"] = 0
    if avoid.avoid_highways:
        options["use_highways"] = 0
    if avoid.avoid_ferries:
        options["use_ferry"] = 0
    if avoid.avoid_unpaved:
        options["exclude_unpaved"] = True
    return options


def _exclude_polygons(avoid: AvoidancePreferences) -> list[list[list[float]]]:
    # Valhalla wants a flat list of rings; the exterior ring alone is enough for an avoid area.
    return [[list(coord) for coord in polygon.coordinates[0]] for polygon in avoid.exclude_polygons]


def _parse_trip_legs(trip: dict) -> list[tuple[list[tuple[float, float]], float, float]]:
    """Per-leg (coords, distance_m, duration_s), in trip.legs[] order — one entry per origin/waypoint/destination hop."""
    legs = []
    for leg in trip["legs"]:
        coords = [(lon, lat) for lat, lon in polyline.decode(leg["shape"], 6)]
        summary = leg["summary"]
        legs.append((coords, summary["length"] * _METERS_PER_KM, summary["time"]))
    return legs


def _merge_legs(
    legs: list[tuple[list[tuple[float, float]], float, float]],
) -> tuple[list[tuple[float, float]], float, float]:
    """Concatenate legs into one path, dropping the duplicate stop coordinate at each leg boundary."""
    coords: list[tuple[float, float]] = []
    distance_m = 0.0
    duration_s = 0.0
    for leg_coords, leg_distance_m, leg_duration_s in legs:
        if coords and coords[-1] == leg_coords[0]:
            leg_coords = leg_coords[1:]
        coords.extend(leg_coords)
        distance_m += leg_distance_m
        duration_s += leg_duration_s
    return coords, distance_m, duration_s


def _parse_trip(trip: dict) -> tuple[list[tuple[float, float]], float, float]:
    """Shared by /trace_route and alternates — both only need the merged path, not per-leg detail."""
    return _merge_legs(_parse_trip_legs(trip))


class ValhallaRoutingRepository(RoutingRepository):
    """Routing backend that computes routes in-process against pre-built Valhalla tiles."""

    supports_matrix = True
    supports_map_matching = True

    def __init__(self, config: ValhallaRoutingConfig):
        tile_path = resolve_tile_path(config)
        if tile_path.is_dir():
            self._valhalla_config = get_config(tile_dir=str(tile_path), tile_extract="")
        else:
            self._valhalla_config = get_config(tile_extract=str(tile_path), tile_dir="")
        self._valhalla_config["service_limits"]["max_exclude_polygons_length"] = _MAX_EXCLUDE_POLYGONS_LENGTH_M
        # Valhalla's Actor isn't safe for concurrent calls from multiple threads — give each
        # asyncio.to_thread worker its own, backed by the same mmap'd tile data (shared OS page
        # cache, not duplicated in memory), rather than serializing every request behind a lock.
        self._local = threading.local()

    def _actor(self) -> Actor:
        actor = getattr(self._local, "actor", None)
        if actor is None:
            actor = Actor(self._valhalla_config)
            self._local.actor = actor
        return actor

    async def compute_route(self, request: RouteRequest) -> Route:
        """Compute a new route between the request's origin and destination."""
        return await asyncio.to_thread(self._compute_route_sync, request)

    async def compute_isochrone(self, request: IsochroneRequest) -> Isochrone:
        """Compute the reachable area from a point within a time budget, over the road network."""
        return await asyncio.to_thread(self._compute_isochrone_sync, request)

    async def compute_matrix(
        self, *, origin: Point, destinations: list[Point], network_type: NetworkType = NetworkType.DRIVE
    ) -> list[MatrixEntry]:
        """Real drive time/distance from origin to each destination, aligned by index.

        Valhalla-only — no equivalent on the networkx backend. Used to refine POI
        ranking from straight-line distance to real drive time; see agent/tools.py.
        """
        return await asyncio.to_thread(
            self._compute_matrix_sync, origin=origin, destinations=destinations, network_type=network_type
        )

    async def match_track(self, *, track: TrackDetail) -> MapMatchResult:
        """Snap a track's raw GPS points onto the actual roads it drove.

        Valhalla-only — no equivalent on the networkx backend.
        """
        return await asyncio.to_thread(self._match_track_sync, track=track)

    def _compute_matrix_sync(
        self, *, origin: Point, destinations: list[Point], network_type: NetworkType
    ) -> list[MatrixEntry]:
        costing = _COSTING_BY_NETWORK_TYPE[network_type]
        valhalla_request = {
            "sources": [{"lon": origin.coordinates[0], "lat": origin.coordinates[1]}],
            "targets": [{"lon": d.coordinates[0], "lat": d.coordinates[1]} for d in destinations],
            "costing": costing,
        }
        try:
            response = self._actor().matrix(valhalla_request)
        except ValhallaError as exc:
            raise ValueError(str(exc)) from exc

        entries_by_target = {entry["to_index"]: entry for entry in response["sources_to_targets"][0]}
        results = []
        for index in range(len(destinations)):
            entry = entries_by_target.get(index, {})
            distance_km, duration_s = entry.get("distance"), entry.get("time")
            results.append(
                MatrixEntry(
                    distance_m=distance_km * _METERS_PER_KM if distance_km is not None else None,
                    duration_s=duration_s,
                )
            )
        return results

    def _match_track_sync(self, *, track: TrackDetail) -> MapMatchResult:
        if len(track.points) < 2:
            raise ValueError("Need at least 2 points to map-match a track")

        sorted_points = sorted(track.points, key=lambda p: p.date_recorded)
        start = sorted_points[0].date_recorded
        shape_points = [
            {
                "lon": p.geometry.coordinates[0],
                "lat": p.geometry.coordinates[1],
                "time": (p.date_recorded - start).total_seconds(),
            }
            for p in sorted_points
        ]
        valhalla_request = {"shape": shape_points, "costing": "auto", "shape_match": "map_snap"}
        try:
            response = self._actor().trace_route(valhalla_request)
        except ValhallaError as exc:
            raise ValueError(str(exc)) from exc

        coords, distance_m, duration_s = _parse_trip(response["trip"])
        return MapMatchResult(
            track_id=track.id,
            geometry=LineString(type="LineString", coordinates=coords),
            distance_m=distance_m,
            duration_s=duration_s,
            date_created=datetime.now(UTC),
        )

    def _compute_route_sync(self, request: RouteRequest) -> Route:
        stops = [request.origin, *request.waypoints, request.destination]
        costing = _COSTING_BY_NETWORK_TYPE[request.network_type]
        valhalla_request = {
            "locations": [{"lon": p.coordinates[0], "lat": p.coordinates[1]} for p in stops],
            "costing": costing,
            "costing_options": {costing: _costing_options(request.avoid)},
        }
        exclude_polygons = _exclude_polygons(request.avoid)
        if exclude_polygons:
            valhalla_request["exclude_polygons"] = exclude_polygons
        if request.max_alternates:
            # Valhalla only honors alternates for a single origin/destination leg, not multi-stop trips.
            valhalla_request["alternates"] = request.max_alternates

        try:
            response = self._actor().route(valhalla_request)
        except ValhallaError as exc:
            raise ValueError(str(exc)) from exc

        trip_legs = _parse_trip_legs(response["trip"])
        coords, distance_m, duration_s = _merge_legs(trip_legs)
        legs = [
            RouteLeg(
                origin=leg_origin,
                destination=leg_destination,
                geometry=LineString(type="LineString", coordinates=leg_coords),
                distance_m=leg_distance_m,
                duration_s=leg_duration_s,
            )
            for (leg_origin, leg_destination), (leg_coords, leg_distance_m, leg_duration_s) in zip(
                zip(stops[:-1], stops[1:], strict=True), trip_legs, strict=True
            )
        ]

        alternates = []
        for alternate in response.get("alternates", []):
            alt_coords, alt_distance_m, alt_duration_s = _parse_trip(alternate["trip"])
            alternates.append(
                RouteAlternate(
                    id=str(uuid4()),
                    geometry=LineString(type="LineString", coordinates=alt_coords),
                    distance_m=alt_distance_m,
                    duration_s=alt_duration_s,
                )
            )

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
            legs=legs,
            alternates=alternates,
            date_created=datetime.now(UTC),
        )

    def _compute_isochrone_sync(self, request: IsochroneRequest) -> Isochrone:
        costing = _COSTING_BY_NETWORK_TYPE[request.network_type]
        valhalla_request = {
            "locations": [{"lon": request.origin.coordinates[0], "lat": request.origin.coordinates[1]}],
            "costing": costing,
            "costing_options": {costing: _costing_options(request.avoid)},
            "contours": [{"time": request.minutes}],
            "polygons": True,
        }
        exclude_polygons = _exclude_polygons(request.avoid)
        if exclude_polygons:
            valhalla_request["exclude_polygons"] = exclude_polygons

        try:
            response = self._actor().isochrone(valhalla_request)
        except ValhallaError as exc:
            raise ValueError(str(exc)) from exc

        geometry = shape(response["features"][0]["geometry"])
        if geometry.geom_type != "Polygon":
            # Contour can split into disjoint parts (e.g. an island reachable only across water);
            # matches the same "force a single Polygon" tradeoff the networkx backend makes.
            geometry = geometry.convex_hull

        return Isochrone(
            origin=request.origin,
            minutes=request.minutes,
            geometry=Polygon(**mapping(geometry)),
            # Valhalla doesn't expose a reachable-node count — vertex count of the contour is
            # the closest available proxy for the "rough density signal" the field documents.
            reachable_node_count=len(geometry.exterior.coords),
        )
