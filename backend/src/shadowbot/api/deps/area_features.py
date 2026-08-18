"""Dependency injector for area-feature lookup."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from shadowbot.api.deps.overpass import get_overpass_client
from shadowbot.api.settings import Settings
from shadowbot.datastores.networkx.area_features import AreaFeatureFinder

settings = Settings()


@lru_cache(maxsize=1)
def get_area_feature_finder() -> AreaFeatureFinder:
    """Return the area-feature lookup backend, sharing the road network's Overpass client."""
    return AreaFeatureFinder(
        overpass_client=get_overpass_client(),
        osm_website_url=settings.osm_website_url,
    )


AreaFeatureDatastoreDep = Annotated[AreaFeatureFinder, Depends(get_area_feature_finder)]
