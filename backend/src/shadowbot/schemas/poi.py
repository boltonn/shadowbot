"""Schemas for point-of-interest search near a location or along a route."""

from enum import StrEnum

from geojson_pydantic import Point
from pydantic import Field

from shadowbot.schemas.base import CamelModel


class PoiCategory(StrEnum):
    """OSM tag shorthand for the POI categories Shadowbot can search for."""

    GAS_STATION = "gas_station"
    EV_CHARGING = "ev_charging"
    SUPERMARKET = "supermarket"
    RESTAURANT = "restaurant"
    COFFEE = "coffee"
    PARKING = "parking"
    REST_AREA = "rest_area"
    HOTEL = "hotel"
    PHARMACY = "pharmacy"
    HOSPITAL = "hospital"


class Poi(CamelModel):
    """A single point-of-interest search result."""

    name: str | None = Field(default=None)
    category: PoiCategory
    geometry: Point
    distance_m: float = Field(
        description="Distance from the search origin, or nearest approach to the route"
    )


class NearbyPoiRequest(CamelModel):
    """Find POIs of one or more categories near a single point."""

    origin: Point
    categories: list[PoiCategory] = Field(
        min_length=1, description="e.g. [gas_station, coffee] to search both in one request"
    )
    name_query: str | None = Field(
        default=None, description="Case-insensitive filter against the POI's name/brand, e.g. 'Whole Foods'"
    )
    radius_m: float = Field(default=8_000, gt=0, le=50_000)
    limit: int = Field(default=5, ge=1, le=20)


class RoutePoiRequest(CamelModel):
    """Find POIs of one or more categories within a corridor around a previously planned route."""

    categories: list[PoiCategory] = Field(
        min_length=1, description="e.g. [gas_station, coffee] to search both in one request"
    )
    name_query: str | None = Field(default=None)
    corridor_m: float = Field(
        default=1_500, gt=0, le=10_000, description="How far off the route path still counts as 'on the way'"
    )
    limit: int = Field(default=5, ge=1, le=20)
