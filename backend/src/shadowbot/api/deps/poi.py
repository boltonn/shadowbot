"""Dependency injector for POI search."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from shadowbot.api.deps.overpass import get_overpass_client
from shadowbot.api.settings import Settings
from shadowbot.datastores.networkx.poi import PoiRepository

settings = Settings()


@lru_cache(maxsize=1)
def get_poi_repository() -> PoiRepository:
    """Return the configured POI search backend, sharing the road network's Overpass client."""
    return PoiRepository(
        config=settings.routing,
        overpass_client=get_overpass_client(),
        osm_website_url=settings.osm_website_url,
    )


PoiDatastoreDep = Annotated[PoiRepository, Depends(get_poi_repository)]
