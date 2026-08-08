"""Dependency injector for the active routing backend."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from shadowbot.api.settings import Settings
from shadowbot.datastores.networkx.repository import NetworkXRoutingRepository

settings = Settings()


@lru_cache(maxsize=1)
def get_routing_repository() -> NetworkXRoutingRepository:
    """Return the configured routing backend.

    Today this always builds the NetworkX backend; a pgRouting-backed
    alternative can be added here later behind the same RoutingRepository
    shape without touching route handlers.
    """
    return NetworkXRoutingRepository(config=settings.routing)


RoutingDatastoreDep = Annotated[NetworkXRoutingRepository, Depends(get_routing_repository)]
