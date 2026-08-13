"""POI search via Overpass tag queries, using the shared OverpassClient for fetching."""

import asyncio
from typing import cast

import osmnx as ox
import pandas as pd
from geojson_pydantic import Point
from geojson_pydantic.types import Position2D
from shapely.geometry import Point as ShapelyPoint, Polygon, shape
from shapely.geometry.base import BaseGeometry

from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.datastores.networkx.osm_tags import TagEntry, infer_category, merged_tags, tag_entries
from shadowbot.integrations.overpass import OverpassClient
from shadowbot.schemas.poi import NearbyPoiRequest, Poi, RoutePoiRequest
from shadowbot.schemas.routing import Route

# Good enough for a single-region prototype without a projected-CRS round trip —
# matches the same tradeoff NetworkXRoutingRepository makes for its reroute buffer.
_METERS_PER_DEGREE = 111_320


class PoiRepository:
    """Finds points of interest near a location or along a route via Overpass tag search."""

    def __init__(self, config: NetworkXRoutingConfig, overpass_client: OverpassClient):
        self.config = config
        self.overpass_client = overpass_client

    async def find_near_point(self, request: NearbyPoiRequest) -> list[Poi]:
        """Find the nearest POIs of one or more categories within a radius of a point."""
        return await asyncio.to_thread(self._find_near_point_sync, request)

    async def find_along_route(self, route: Route, request: RoutePoiRequest) -> list[Poi]:
        """Find the nearest POIs of one or more categories within a corridor around a route."""
        return await asyncio.to_thread(self._find_along_route_sync, route, request)

    def _find_near_point_sync(self, request: NearbyPoiRequest) -> list[Poi]:
        lon, lat = request.origin.coordinates[:2]
        search_area = ShapelyPoint(lon, lat).buffer(request.radius_m / _METERS_PER_DEGREE)
        entries = tag_entries(request.categories, request.raw_tags)
        features = self._query_features(search_area, entries)
        return self._rank(
            features,
            reference_geom=ShapelyPoint(lon, lat),
            entries=entries,
            name_query=request.name_query,
            limit=request.limit,
        )

    def _find_along_route_sync(self, route: Route, request: RoutePoiRequest) -> list[Poi]:
        route_line = shape(route.geometry.model_dump(mode="json"))
        corridor = route_line.buffer(request.corridor_m / _METERS_PER_DEGREE)
        entries = tag_entries(request.categories, request.raw_tags)
        features = self._query_features(corridor, entries)
        return self._rank(
            features,
            reference_geom=route_line,
            entries=entries,
            name_query=request.name_query,
            limit=request.limit,
        )

    def _query_features(self, search_area: BaseGeometry, entries: list[TagEntry]) -> pd.DataFrame:
        """Query POI tags within search_area via Overpass."""
        tags = merged_tags(entries)
        # .buffer() on a Point/LineString always yields a Polygon, never Multi* — shapely's
        # return type is the broader BaseGeometry since that's true of buffer() in general.
        polygon = cast(Polygon, search_area)
        return self.overpass_client.call_with_retry(fetch=lambda: ox.features_from_polygon(polygon, tags=tags))

    def _rank(
        self,
        features: pd.DataFrame,
        reference_geom: BaseGeometry,
        entries: list[TagEntry],
        name_query: str | None,
        limit: int,
    ) -> list[Poi]:
        if features.empty:
            return []
        if name_query:
            name = features["name"] if "name" in features.columns else pd.Series("", index=features.index)
            brand = features["brand"] if "brand" in features.columns else pd.Series("", index=features.index)
            matches = name.astype(str).str.contains(name_query, case=False, na=False) | brand.astype(
                str
            ).str.contains(name_query, case=False, na=False)
            features = cast(pd.DataFrame, features[matches])
            if features.empty:
                return []

        pois = []
        for _, row in features.iterrows():
            centroid = row.geometry.centroid
            distance_m = reference_geom.distance(centroid) * _METERS_PER_DEGREE
            name = row.get("name")
            pois.append(
                Poi(
                    name=name if isinstance(name, str) else None,
                    category=infer_category(row, entries),
                    geometry=Point(
                        type="Point", coordinates=Position2D(longitude=float(centroid.x), latitude=float(centroid.y))
                    ),
                    distance_m=distance_m,
                )
            )
        pois.sort(key=lambda poi: poi.distance_m)
        return pois[:limit]
