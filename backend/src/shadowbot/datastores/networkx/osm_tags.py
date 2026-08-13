"""Shared OSM tag-entry helpers for Overpass-based feature search (POIs and area features)."""

import pandas as pd

from shadowbot.schemas.poi import OsmTag, PoiCategory

# Each category maps to exactly one (osm_key, osm_value) pair — kept single-valued so a result
# row can be matched back to the category that found it (see infer_category).
CATEGORY_TAGS: dict[PoiCategory, tuple[str, str]] = {
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
TagEntry = tuple[str, str, PoiCategory | str]


def tag_entries(categories: list[PoiCategory], raw_tags: list[OsmTag]) -> list[TagEntry]:
    """Combine curated categories and raw OSM tags into one list of (key, value, label) entries."""
    entries: list[TagEntry] = [(*CATEGORY_TAGS[category], category) for category in categories]
    entries += [(tag.key, tag.value, f"{tag.key}={tag.value}") for tag in raw_tags]
    return entries


def merged_tags(entries: list[TagEntry]) -> dict[str, bool | str | list[str]]:
    """Combine every tag entry into one Overpass query, OR-ing same-key values."""
    merged: dict[str, list[str]] = {}
    for key, value, _label in entries:
        merged.setdefault(key, []).append(value)
    return {key: values[0] if len(values) == 1 else values for key, values in merged.items()}


def infer_category(row: pd.Series, entries: list[TagEntry]) -> PoiCategory | str:
    """Match a result row back to whichever tag entry found it."""
    for key, value, label in entries:
        if row.get(key) == value:
            return label
    return entries[0][2]
