"""Finds area features (parks, lakes, malls, or any other tagged polygon) near a point or along a route.

Boundary-contact counting is a heuristic: it counts distinct points where the drive/walk/bike path
network crosses and/or touches a feature's outer boundary — filtered by way_types (OSM highway= tag
values) and boundary_contact (crosses/touches/any) — clustering points within _EXIT_CLUSTER_M of each
other into one contact so a multi-lane path or two closely-tagged ways at the same gate don't get
double-counted. OSM entrance tagging is too inconsistent across feature types to rely on directly.

Both boundary-contact counting and "does a route pass through this feature" are 2D-only checks
against plan-view geometry, so a bridge or tunnel that merely passes over/under a feature (e.g. a
highway flying over a park's corner) would otherwise look identical to a road that actually enters
it. Ways tagged bridge=yes/tunnel=yes are excluded from boundary-contact counting, and a buffered
union of them is subtracted from the route/polygon intersection before deciding a route "passes
through" a feature at all — see _is_grade_separated and _at_grade_intersection.

Both checks need real way geometry near the feature, but nothing about routing — no speeds, travel
times, or a routable topology. So rather than building/caching a full routable graph the way
compute_route's coverage does (get_graph_for_points, sized to an ~11km tile and slow to fetch/parse
even from cache), _ways_near_feature runs a plain Overpass tag query scoped to a small buffer
around just this one feature — the same kind of direct query _query_features already uses for the
tag search itself, just filtered to highway=* instead of the requested categories.
"""

import asyncio

import geopandas as gpd
import osmnx as ox
import pandas as pd
from geojson_pydantic import MultiPolygon as GeoMultiPolygon, Point, Polygon as GeoPolygon
from geojson_pydantic.types import Position2D
from osmnx._errors import InsufficientResponseError
from shapely.geometry import LineString as ShapelyLineString, Point as ShapelyPoint, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from shadowbot.datastores.networkx.osm_tags import (
    TagEntry,
    element_identity,
    infer_category,
    merged_tags,
    osm_url,
    raw_tags,
    tag_entries,
)
from shadowbot.integrations.overpass import OverpassClient
from shadowbot.schemas.poi import OsmTag, PoiCategory
from shadowbot.schemas.routing import AreaMatch, BoundaryContact, Route

_METERS_PER_DEGREE = 111_320
_EXIT_CLUSTER_M = 20
_WAY_QUERY_BUFFER_M = 100
_BRIDGE_EXCLUSION_BUFFER_M = 25


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _is_grade_separated(data: dict | pd.Series) -> bool:
    """True for a bridge/tunnel way — physically doesn't touch the ground it appears to cross in 2D."""
    return any(str(v).lower() == "yes" for v in _as_list(data.get("bridge"))) or any(
        str(v).lower() == "yes" for v in _as_list(data.get("tunnel"))
    )


def _cluster_count(points: list[ShapelyPoint], radius_deg: float) -> int:
    """Count distinct contact locations, merging any point within radius_deg of one already kept."""
    kept: list[ShapelyPoint] = []
    for point in points:
        if not any(point.distance(existing) <= radius_deg for existing in kept):
            kept.append(point)
    return len(kept)


class AreaFeatureFinder:
    """Finds tagged area features near a point or intersecting a route corridor, with size/boundary-contact count."""

    def __init__(self, overpass_client: OverpassClient, osm_website_url: str):
        self.overpass_client = overpass_client
        self.osm_website_url = osm_website_url

    async def find_along_route(
        self,
        route: Route,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        corridor_m: float,
        way_types: list[str] | None = None,
        boundary_contact: BoundaryContact = BoundaryContact.CROSSES,
        compute_exit_count: bool = True,
    ) -> list[AreaMatch]:
        """Find tagged polygon features the route actually crosses, with size and (if requested) boundary-contact count."""
        return await asyncio.to_thread(
            self._find_along_route_sync,
            route,
            categories,
            raw_tags,
            corridor_m,
            way_types or [],
            boundary_contact,
            compute_exit_count,
        )

    async def find_near_point(
        self,
        origin: Point,
        radius_m: float,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        way_types: list[str] | None = None,
        boundary_contact: BoundaryContact = BoundaryContact.CROSSES,
        compute_exit_count: bool = True,
    ) -> list[AreaMatch]:
        """Find tagged features within radius_m of a point, with size and (if requested) boundary-contact count."""
        lon, lat = origin.coordinates[:2]
        search_area = ShapelyPoint(lon, lat).buffer(radius_m / _METERS_PER_DEGREE)
        return await asyncio.to_thread(
            self._find_within_geometry_sync,
            search_area,
            categories,
            raw_tags,
            way_types or [],
            boundary_contact,
            compute_exit_count,
        )

    async def find_within_boundary(
        self,
        boundary: GeoPolygon | GeoMultiPolygon,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        way_types: list[str] | None = None,
        boundary_contact: BoundaryContact = BoundaryContact.CROSSES,
        compute_exit_count: bool = True,
    ) -> list[AreaMatch]:
        """Find tagged features anywhere within boundary, with size and (if requested) boundary-contact count."""
        search_area = shape(boundary.model_dump(mode="json"))
        return await asyncio.to_thread(
            self._find_within_geometry_sync,
            search_area,
            categories,
            raw_tags,
            way_types or [],
            boundary_contact,
            compute_exit_count,
        )

    async def find_along_line(
        self,
        origin: Point,
        destination: Point,
        corridor_m: float,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        way_types: list[str] | None = None,
        boundary_contact: BoundaryContact = BoundaryContact.CROSSES,
        compute_exit_count: bool = True,
    ) -> list[AreaMatch]:
        """Find tagged features within corridor_m of the straight line between origin and destination.

        Unlike find_along_route, this needs no planned route — it's for "what's between A and B"
        in general, not "what does this specific driving route pass through".
        """
        line = ShapelyLineString([tuple(origin.coordinates[:2]), tuple(destination.coordinates[:2])])
        search_area = line.buffer(corridor_m / _METERS_PER_DEGREE)
        return await asyncio.to_thread(
            self._find_within_geometry_sync,
            search_area,
            categories,
            raw_tags,
            way_types or [],
            boundary_contact,
            compute_exit_count,
        )

    def _find_along_route_sync(
        self,
        route: Route,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        corridor_m: float,
        way_types: list[str],
        boundary_contact: BoundaryContact,
        compute_exit_count: bool,
    ) -> list[AreaMatch]:
        route_line = shape(route.geometry.model_dump(mode="json"))
        corridor = route_line.buffer(corridor_m / _METERS_PER_DEGREE)
        entries = tag_entries(categories, raw_tags)
        features = self._query_features(corridor, entries)
        if features.empty:
            return []

        matches = []
        for index, row in features.iterrows():
            geometry = row.geometry
            if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
                continue
            # Needs the feature's nearby ways regardless of compute_exit_count, to tell a genuine
            # at-grade crossing from a road that merely passes over/under on a bridge/tunnel.
            if self._at_grade_intersection(route_line, geometry).is_empty:
                continue
            matches.append(
                self._build_match(index, row, geometry, entries, way_types, boundary_contact, compute_exit_count)
            )
        return matches

    def _find_within_geometry_sync(
        self,
        search_area: BaseGeometry,
        categories: list[PoiCategory],
        raw_tags: list[OsmTag],
        way_types: list[str],
        boundary_contact: BoundaryContact,
        compute_exit_count: bool,
    ) -> list[AreaMatch]:
        entries = tag_entries(categories, raw_tags)
        features = self._query_features(search_area, entries)
        if features.empty:
            return []

        matches = []
        for index, row in features.iterrows():
            geometry = row.geometry
            if geometry.geom_type not in {"Point", "Polygon", "MultiPolygon"}:
                continue
            matches.append(
                self._build_match(index, row, geometry, entries, way_types, boundary_contact, compute_exit_count)
            )
        return matches

    def _query_features(self, search_area: BaseGeometry, entries: list[TagEntry]) -> pd.DataFrame:
        """Tagged features within search_area, or an empty frame if none exist — not every search_area has a match.

        Caught here rather than left to call_with_retry: InsufficientResponseError there means
        "keep retrying, this might be a transient Overpass hiccup," but a search_area genuinely
        having zero matching features is a normal, common outcome, not a fetch failure.
        """
        tags = merged_tags(entries)

        def fetch() -> pd.DataFrame:
            try:
                return ox.features_from_polygon(search_area, tags=tags)
            except InsufficientResponseError:
                return gpd.GeoDataFrame()

        return self.overpass_client.call_with_retry(fetch=fetch)

    def _build_match(
        self,
        index: object,
        row: pd.Series,
        geometry: BaseGeometry,
        entries: list[TagEntry],
        way_types: list[str],
        boundary_contact: BoundaryContact,
        compute_exit_count: bool,
    ) -> AreaMatch:
        name = row.get("name")
        element_type, osm_id = element_identity(index)
        is_polygon = geometry.geom_type in {"Polygon", "MultiPolygon"}
        outline = geometry if geometry.geom_type == "Polygon" else geometry.convex_hull if is_polygon else None
        return AreaMatch(
            name=name if isinstance(name, str) else None,
            category=infer_category(row, entries),
            geometry=GeoPolygon(**mapping(outline))
            if is_polygon
            else Point(type="Point", coordinates=Position2D(longitude=geometry.x, latitude=geometry.y)),
            area_m2=self._area_m2(geometry) if is_polygon else None,
            # Fetching/parsing the local road graph to count boundary contacts is the expensive
            # part of a feature search — skip it whenever the caller has no min_boundary_count/
            # min_area_exits threshold to apply it against, rather than paying that cost on every
            # match just to compute a number nobody asked for.
            exit_count=self._boundary_count(geometry, way_types, boundary_contact)
            if is_polygon and compute_exit_count
            else None,
            osm_type=element_type,
            osm_id=osm_id,
            raw_tags=raw_tags(row),
            url=osm_url(self.osm_website_url, element_type, osm_id),
        )

    def _area_m2(self, geometry: BaseGeometry) -> float:
        projected, _crs = ox.projection.project_geometry(geometry)
        return projected.area

    def _ways_near_feature(self, feature_geometry: BaseGeometry) -> pd.DataFrame:
        """Raw highway=* way geometries within a small buffer of a feature — a plain tag query.

        Boundary-contact/at-grade checks only need real way geometry to test against the
        feature's boundary, not a routable graph (speeds, travel times, a cached regional tile)
        the way compute_route's coverage builds — that would fetch/parse far more than this needs.
        """
        search_area = feature_geometry.buffer(_WAY_QUERY_BUFFER_M / _METERS_PER_DEGREE)

        def fetch() -> pd.DataFrame:
            try:
                return ox.features_from_polygon(search_area, tags={"highway": True})
            except InsufficientResponseError:
                return gpd.GeoDataFrame()

        return self.overpass_client.call_with_retry(fetch=fetch)

    def _at_grade_intersection(self, route_line: BaseGeometry, polygon: BaseGeometry) -> BaseGeometry:
        """The portion of route_line ∩ polygon that isn't solely where the route crosses on a bridge/tunnel."""
        intersection = route_line.intersection(polygon)
        if intersection.is_empty:
            return intersection
        ways = self._ways_near_feature(polygon)
        bridge_geoms = [row.geometry for _, row in ways.iterrows() if _is_grade_separated(row)]
        if not bridge_geoms:
            return intersection
        exclusion = unary_union(bridge_geoms).buffer(_BRIDGE_EXCLUSION_BUFFER_M / _METERS_PER_DEGREE)
        return intersection.difference(exclusion)

    def _boundary_count(
        self, feature_geometry: BaseGeometry, way_types: list[str], boundary_contact: BoundaryContact
    ) -> int:
        ways = self._ways_near_feature(feature_geometry)
        boundary = feature_geometry.boundary
        contacts: list[ShapelyPoint] = []
        for _, row in ways.iterrows():
            way_geom = row.geometry
            if way_geom.geom_type not in {"LineString", "MultiLineString"}:
                continue
            if _is_grade_separated(row):
                continue
            if way_types and not (set(_as_list(row.get("highway"))) & set(way_types)):
                continue
            crosses = way_geom.crosses(boundary)
            touches = way_geom.touches(boundary)
            if boundary_contact == BoundaryContact.CROSSES and not crosses:
                continue
            if boundary_contact == BoundaryContact.TOUCHES and not touches:
                continue
            if boundary_contact == BoundaryContact.ANY and not (crosses or touches):
                continue
            intersection = way_geom.intersection(boundary)
            if intersection.geom_type == "Point":
                contacts.append(intersection)
            elif intersection.geom_type == "MultiPoint":
                contacts.extend(intersection.geoms)
        return _cluster_count(contacts, radius_deg=_EXIT_CLUSTER_M / _METERS_PER_DEGREE)
