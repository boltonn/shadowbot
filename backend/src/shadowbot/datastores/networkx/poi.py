"""POI search via Overpass tag queries, layered on the road-network cache's osmnx config."""

import asyncio

import osmnx as ox
import pandas as pd
from geojson_pydantic import Point
from shapely.geometry import Point as ShapelyPoint, shape
from shapely.geometry.base import BaseGeometry

from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.integrations.overpass import call_with_retry
from shadowbot.schemas.poi import NearbyPoiRequest, OsmTag, Poi, PoiCategory, RoutePoiRequest
from shadowbot.schemas.routing import Route

# Good enough for a single-region prototype without a projected-CRS round trip —
# matches the same tradeoff NetworkXRoutingRepository makes for its reroute buffer.
_METERS_PER_DEGREE = 111_320

# Each category maps to exactly one (osm_key, osm_value) pair — kept single-valued so
# a result row can be matched back to the category that found it (see _infer_category).
_CATEGORY_TAGS: dict[PoiCategory, tuple[str, str]] = {
    PoiCategory.GAS_STATION: ("amenity", "fuel"),
    PoiCategory.EV_CHARGING: ("amenity", "charging_station"),
    PoiCategory.SUPERMARKET: ("shop", "supermarket"),
    PoiCategory.RESTAURANT: ("amenity", "restaurant"),
    PoiCategory.COFFEE: ("amenity", "cafe"),
    PoiCategory.PARKING: ("amenity", "parking"),
    PoiCategory.REST_AREA: ("highway", "rest_area"),
    PoiCategory.HOTEL: ("tourism", "hotel"),
    PoiCategory.PHARMACY: ("amenity", "pharmacy"),
    PoiCategory.HOSPITAL: ("amenity", "hospital"),
    PoiCategory.PARK: ("leisure", "park"),
    PoiCategory.BANK: ("amenity", "bank"),
    PoiCategory.ATM: ("amenity", "atm"),
    PoiCategory.CAR_REPAIR: ("shop", "car_repair"),
    PoiCategory.CAMPGROUND: ("tourism", "camp_site"),
}

# (osm_key, osm_value, result label) triples — curated categories label themselves,
# raw tags label as "key=value" since there's no PoiCategory to attach to the result.
_TagEntry = tuple[str, str, PoiCategory | str]


def _tag_entries(categories: list[PoiCategory], raw_tags: list[OsmTag]) -> list[_TagEntry]:
    entries: list[_TagEntry] = [(*_CATEGORY_TAGS[category], category) for category in categories]
    entries += [(tag.key, tag.value, f"{tag.key}={tag.value}") for tag in raw_tags]
    return entries


def _merged_tags(entries: list[_TagEntry]) -> dict[str, bool | str | list[str]]:
    """Combine every tag entry into one Overpass query, OR-ing same-key values."""
    merged: dict[str, list[str]] = {}
    for key, value, _label in entries:
        merged.setdefault(key, []).append(value)
    return {key: values[0] if len(values) == 1 else values for key, values in merged.items()}


def _infer_category(row: pd.Series, entries: list[_TagEntry]) -> PoiCategory | str:
    for key, value, label in entries:
        if row.get(key) == value:
            return label
    return entries[0][2]


class PoiRepository:
    """Finds points of interest near a location or along a route via Overpass tag search."""

    def __init__(self, config: NetworkXRoutingConfig):
        self.config = config

    async def find_near_point(self, request: NearbyPoiRequest) -> list[Poi]:
        """Find the nearest POIs of one or more categories within a radius of a point."""
        return await asyncio.to_thread(self._find_near_point_sync, request)

    async def find_along_route(self, route: Route, request: RoutePoiRequest) -> list[Poi]:
        """Find the nearest POIs of one or more categories within a corridor around a route."""
        return await asyncio.to_thread(self._find_along_route_sync, route, request)

    def _find_near_point_sync(self, request: NearbyPoiRequest) -> list[Poi]:
        lon, lat = request.origin.coordinates[:2]
        search_area = ShapelyPoint(lon, lat).buffer(request.radius_m / _METERS_PER_DEGREE)
        entries = _tag_entries(request.categories, request.raw_tags)
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
        entries = _tag_entries(request.categories, request.raw_tags)
        features = self._query_features(corridor, entries)
        return self._rank(
            features,
            reference_geom=route_line,
            entries=entries,
            name_query=request.name_query,
            limit=request.limit,
        )

    def _query_features(self, search_area: BaseGeometry, entries: list[_TagEntry]) -> pd.DataFrame:
        """Query POI tags within search_area via Overpass."""
        tags = _merged_tags(entries)
        return call_with_retry(
            overpass_url=self.config.overpass_url, fetch=lambda: ox.features_from_polygon(search_area, tags=tags)
        )

    def _rank(
        self,
        features: pd.DataFrame,
        reference_geom: BaseGeometry,
        entries: list[_TagEntry],
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
            features = features[matches]
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
                    category=_infer_category(row, entries),
                    geometry=Point(type="Point", coordinates=(centroid.x, centroid.y)),
                    distance_m=distance_m,
                )
            )
        pois.sort(key=lambda poi: poi.distance_m)
        return pois[:limit]
