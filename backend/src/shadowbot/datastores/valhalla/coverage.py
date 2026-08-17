"""Loads the coverage.json manifest describing which areas have fast, pre-compiled tiles.

The manifest is hand-curated via scripts/describe_coverage_area.py, resolved next to
tiles.tar by default. Coverage is purely informational (surfaced to the user and the
chat agent) — never allowed to break startup or routing, so any failure to resolve/parse
it just means "coverage unknown".
"""

import json
from datetime import UTC, datetime
from pathlib import Path

from geojson_pydantic import Point, Polygon
from loguru import logger
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import shape

from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig
from shadowbot.datastores.valhalla.tiles import resolve_uri
from shadowbot.schemas.routing import CoverageRegion


def _bbox_to_polygon(bounds: list[float]) -> Polygon:
    west, south, east, north = bounds
    ring = [(west, south), (east, south), (east, north), (west, north), (west, south)]
    return Polygon(type="Polygon", coordinates=[ring])


def _default_coverage_uri(tile_uri: str) -> str:
    if tile_uri.startswith("s3://"):
        return tile_uri.rsplit("/", 1)[0] + "/coverage.json"
    return str(Path(tile_uri).expanduser().parent / "coverage.json")


def load_coverage_regions(config: ValhallaRoutingConfig) -> list[CoverageRegion]:
    """Return the deployment's compiled coverage regions, or [] if none/unavailable."""
    if config.tile_uri is None:
        return []
    uri = config.coverage_uri or _default_coverage_uri(config.tile_uri)

    try:
        path = resolve_uri(uri, cache_dir=config.cache_dir)
        if not path.exists():
            return []
        data = json.loads(path.read_text())
    except Exception:  # noqa: BLE001 — coverage is UX sugar, never fatal
        logger.warning(f"Could not load Valhalla coverage manifest from {uri}")
        return []

    regions = []
    for entry in data.get("regions", []):
        try:
            regions.append(
                CoverageRegion(
                    name=entry["name"],
                    url=entry.get("url"),
                    bounds=_bbox_to_polygon(entry["bounds"]),
                    date_added=entry.get("date_added", datetime.now(UTC)),
                )
            )
        except Exception:  # noqa: BLE001 — skip a malformed entry rather than fail the whole manifest
            logger.warning(f"Skipping malformed coverage region entry: {entry!r}")
    return regions


def is_within_coverage(point: Point, regions: list[CoverageRegion]) -> bool:
    """Whether point falls within any compiled coverage region's bounding box."""
    shapely_point = ShapelyPoint(point.coordinates[0], point.coordinates[1])
    return any(shape(region.bounds.model_dump(mode="json")).contains(shapely_point) for region in regions)
