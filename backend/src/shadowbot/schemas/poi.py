"""Schemas for point-of-interest search near a location or along a route."""

from enum import StrEnum

from geojson_pydantic import Point
from pydantic import Field, model_validator

from shadowbot.schemas.base import CamelModel


class PoiCategory(StrEnum):
    """Curated, well-known POI categories with dedicated frontend icons.

    Not exhaustive — OSM has hundreds of amenity/shop/leisure/tourism tags. For
    anything not listed here, pass raw_tags on the request instead of waiting
    for it to be added to this enum.
    """

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
    PARK = "park"
    BANK = "bank"
    ATM = "atm"
    CAR_REPAIR = "car_repair"
    CAMPGROUND = "campground"


class OsmTag(CamelModel):
    """A raw OSM key/value tag pair, for POI categories outside the curated list.

    e.g. key="leisure", value="dog_park" or key="tourism", value="museum".
    """

    key: str
    value: str


class Poi(CamelModel):
    """A single point-of-interest search result."""

    name: str | None = Field(default=None)
    category: PoiCategory | str = Field(
        description="A PoiCategory value, or 'key=value' for a result matched via raw_tags"
    )
    geometry: Point
    distance_m: float = Field(description="Distance from the search origin, or nearest approach to the route")
    duration_s: float | None = Field(
        default=None,
        description=(
            "Real drive time from the search origin, via the Valhalla routing backend's "
            "time-distance matrix. None when using the networkx backend, or when this "
            "particular POI wasn't reachable by road from the origin."
        ),
    )


class _PoiTagFields(CamelModel):
    """Shared category/raw_tags fields, and the validator tying them together."""

    categories: list[PoiCategory] = Field(
        default_factory=list, description="e.g. [gas_station, coffee] to search both in one request"
    )
    raw_tags: list[OsmTag] = Field(
        default_factory=list,
        description=(
            "Raw OSM key/value tags for categories not in PoiCategory, e.g. "
            "{key: 'leisure', value: 'park'} or {key: 'tourism', value: 'museum'}. "
            "You know common OSM tagging conventions — use them directly rather than "
            "refusing a search just because it isn't in the curated category list. "
            "Combine freely with categories in the same call."
        ),
    )

    @model_validator(mode="after")
    def _require_at_least_one_tag(self) -> "_PoiTagFields":
        if not self.categories and not self.raw_tags:
            raise ValueError("At least one of categories or raw_tags is required")
        return self


class NearbyPoiRequest(_PoiTagFields):
    """Find POIs of one or more categories near a single point."""

    origin: Point
    name_query: str | None = Field(
        default=None, description="Case-insensitive filter against the POI's name/brand, e.g. 'Whole Foods'"
    )
    radius_m: float = Field(default=8_000, gt=0, le=50_000)
    limit: int = Field(default=5, ge=1, le=20)


class RoutePoiRequest(_PoiTagFields):
    """Find POIs of one or more categories within a corridor around a previously planned route."""

    name_query: str | None = Field(default=None)
    corridor_m: float = Field(
        default=1_500, gt=0, le=10_000, description="How far off the route path still counts as 'on the way'"
    )
    limit: int = Field(default=5, ge=1, le=20)
