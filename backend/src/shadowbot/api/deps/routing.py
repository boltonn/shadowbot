"""Dependency injector for the active routing backend."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from shadowbot.api.settings import Settings
from shadowbot.datastores.base.routing import RoutingRepository
from shadowbot.datastores.networkx.repository import NetworkXRoutingRepository

settings = Settings()


@lru_cache(maxsize=1)
def get_routing_repository() -> RoutingRepository:
    """Return the configured routing backend.

    Valhalla (in-process, over pre-built tiles) is used when VALHALLA__TILE_URI
    is set; otherwise falls back to the pure-Python networkx backend, which
    needs no pre-built data or extra dependencies and works out of the box.
    The valhalla extra (`uv sync --extra valhalla`) is only imported here, so
    it's never required unless that env var is actually set.
    """
    if settings.valhalla.tile_uri is not None:
        try:
            from shadowbot.datastores.valhalla.repository import ValhallaRoutingRepository
        except ImportError as exc:
            raise ImportError(
                "VALHALLA__TILE_URI is set but the valhalla extra isn't installed — "
                "run `uv sync --extra valhalla`."
            ) from exc
        return ValhallaRoutingRepository(config=settings.valhalla)
    return NetworkXRoutingRepository(config=settings.routing)


RoutingDatastoreDep = Annotated[RoutingRepository, Depends(get_routing_repository)]
