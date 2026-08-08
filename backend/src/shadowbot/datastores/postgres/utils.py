"""Conversions between GeoAlchemy2 geometry columns and geojson-pydantic models."""

from geoalchemy2.shape import from_shape, to_shape
from geoalchemy2.types import Geometry as GeometryColumnType
from geojson_pydantic import LineString, Point
from shapely.geometry import mapping, shape

SRID = 4326


def point_to_geom(point: Point) -> GeometryColumnType:
    """Convert a GeoJSON Point into a WKBElement for storage."""
    return from_shape(shape(point.model_dump(mode="json")), srid=SRID)


def linestring_to_geom(line: LineString) -> GeometryColumnType:
    """Convert a GeoJSON LineString into a WKBElement for storage."""
    return from_shape(shape(line.model_dump(mode="json")), srid=SRID)


def geom_to_point(geom) -> Point:
    """Convert a stored geometry column value into a GeoJSON Point."""
    return Point(**mapping(to_shape(geom)))


def geom_to_linestring(geom) -> LineString:
    """Convert a stored geometry column value into a GeoJSON LineString."""
    return LineString(**mapping(to_shape(geom)))
