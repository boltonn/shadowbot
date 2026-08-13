"""Dependency injector for the shared Overpass client."""

from functools import lru_cache

from shadowbot.api.settings import Settings
from shadowbot.integrations.overpass import OverpassClient, OverpassConfig

settings = Settings()


@lru_cache(maxsize=8)
def get_overpass_client(config: OverpassConfig | None = None) -> OverpassClient:
    """Return an Overpass client, defaulting to settings.overpass.

    Pass an explicit config to point a specific caller at a different Overpass
    instance (or a different cert/verify) than the shared default — e.g. POI
    search hitting a different deployment than road-network fetching.
    """
    return OverpassClient(config=config or settings.overpass)
