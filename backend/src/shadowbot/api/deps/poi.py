"""Dependency injector for POI search."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from shadowbot.api.settings import Settings
from shadowbot.datastores.networkx.poi import PoiRepository

settings = Settings()


@lru_cache(maxsize=1)
def get_poi_repository() -> PoiRepository:
    """Return the configured POI search backend, sharing the road network's Overpass config."""
    return PoiRepository(config=settings.routing)


PoiDatastoreDep = Annotated[PoiRepository, Depends(get_poi_repository)]
