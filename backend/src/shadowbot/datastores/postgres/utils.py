"""Conversions between GeoAlchemy2 geometry columns and geojson-pydantic models."""

from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from geojson_pydantic import LineString, Point, Polygon
from shapely.geometry import mapping, shape

SRID = 4326


def point_to_geom(point: Point) -> WKBElement:
    """Convert a GeoJSON Point into a WKBElement for storage."""
    return from_shape(shape(point.model_dump(mode="json")), srid=SRID)


def linestring_to_geom(line: LineString) -> WKBElement:
    """Convert a GeoJSON LineString into a WKBElement for storage."""
    return from_shape(shape(line.model_dump(mode="json")), srid=SRID)


def polygon_to_geom(polygon: Polygon) -> WKBElement:
    """Convert a GeoJSON Polygon into a WKBElement for storage."""
    return from_shape(shape(polygon.model_dump(mode="json")), srid=SRID)


def geom_to_point(geom) -> Point:
    """Convert a stored geometry column value into a GeoJSON Point."""
    return Point(**mapping(to_shape(geom)))


def geom_to_linestring(geom) -> LineString:
    """Convert a stored geometry column value into a GeoJSON LineString."""
    return LineString(**mapping(to_shape(geom)))


def geom_to_polygon(geom) -> Polygon:
    """Convert a stored geometry column value into a GeoJSON Polygon."""
    return Polygon(**mapping(to_shape(geom)))


def flatten_distinct_tags(tag_arrays: list[list[str]] | None) -> list[str]:
    """Flatten an `array_agg` of each feature's tags array into one sorted, deduplicated list."""
    return sorted({tag for tags in (tag_arrays or []) for tag in (tags or [])})
