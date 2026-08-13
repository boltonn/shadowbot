"""Async client for the public/self-hosted Nominatim geocoding API."""

import re
from pathlib import Path

import httpx
from geojson_pydantic import Point
from geojson_pydantic.types import Position2D
from pydantic import BaseModel, Field

from shadowbot.schemas.routing import GeocodeRequest, GeocodeResult

_ZIP_PATTERN = re.compile(r"\b\d{5}(-\d{4})?\b")
_STREET_SUFFIXES = (
    "street|st|avenue|ave|drive|dr|road|rd|lane|ln|boulevard|blvd|court|ct|way|"
    "place|pl|circle|cir|parkway|pkwy|terrace|ter|highway|hwy|trail|trl|loop|square|sq"
)
_STREET_PATTERN = re.compile(rf"^\s*\d+\s+.+?\b(?:{_STREET_SUFFIXES})\b\.?", re.IGNORECASE)


def _house_number_fallback(query: str) -> str | None:
    """Retry candidate for addresses whose mailing city doesn't match OSM's actual jurisdiction.

    This area's USPS mailing addresses (e.g. "Falls Church, VA") routinely name a
    city that isn't the property's real OSM-tagged jurisdiction (often
    unincorporated county land) — combining a real house number with that mailing
    city makes Nominatim's parser fail entirely rather than fuzzy-match, even
    though the street+zip alone resolves fine. Drop everything between the street
    and the zip and retry with just those two.
    """
    street_match = _STREET_PATTERN.match(query)
    if street_match is None:
        return None
    zip_match = _ZIP_PATTERN.search(query)
    street = street_match.group(0).strip()
    return f"{street}, {zip_match.group(0)}" if zip_match else street


class NominatimConfig(BaseModel):
    """Nominatim connection configuration."""

    nominatim_url: str = Field(default="https://nominatim.openstreetmap.org")
    user_agent: str = Field(
        default="shadowbot/0.1",
        description="Required by Nominatim's usage policy — identify your deployment",
    )
    cert: Path | tuple[Path, Path] | None = Field(
        default=None,
        description="Client cert for mTLS to a self-hosted instance: a single file, or a (cert, key) pair",
    )
    verify: bool | Path = Field(
        default=True, description="CA bundle path to verify against, or False to disable verification"
    )

    model_config = {"frozen": True}


class NominatimClient:
    """Thin async wrapper around a Nominatim /search endpoint."""

    def __init__(self, config: NominatimConfig):
        self.config = config

    async def geocode(self, request: GeocodeRequest) -> list[GeocodeResult]:
        """Resolve a free-text query into candidate locations.

        Falls back to a house-number+street+zip retry (dropping the city) if the
        full query returns nothing — see _house_number_fallback.
        """
        results = await self._search(request.query, request.limit)
        if results:
            return results
        fallback_query = _house_number_fallback(request.query)
        if fallback_query is None or fallback_query == request.query:
            return results
        return await self._search(fallback_query, request.limit)

    async def _search(self, query: str, limit: int) -> list[GeocodeResult]:
        async with httpx.AsyncClient(
            headers={"User-Agent": self.config.user_agent},
            cert=self._httpx_cert(),
            verify=self._httpx_verify(),
        ) as client:
            response = await client.get(
                f"{self.config.nominatim_url.rstrip('/')}/search",
                params={"q": query, "format": "jsonv2", "limit": limit},
            )
            response.raise_for_status()
            results = response.json()

        return [
            GeocodeResult(
                display_name=result["display_name"],
                geometry=Point(
                    type="Point",
                    coordinates=Position2D(longitude=float(result["lon"]), latitude=float(result["lat"])),
                ),
                place_type=result.get("type"),
            )
            for result in results
        ]

    def _httpx_cert(self) -> str | tuple[str, str] | None:
        if self.config.cert is None:
            return None
        if isinstance(self.config.cert, Path):
            return str(self.config.cert)
        cert, key = self.config.cert
        return str(cert), str(key)

    def _httpx_verify(self) -> bool | str:
        return self.config.verify if isinstance(self.config.verify, bool) else str(self.config.verify)
