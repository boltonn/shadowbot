"""FastAPI lifespan and dependency injectors for the Postgres datastore."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI

from shadowbot.api.settings import Settings
from shadowbot.datastores.postgres.repositories.chat import PostgresChatRepository
from shadowbot.datastores.postgres.repositories.point_dataset import PostgresPointDatasetRepository
from shadowbot.datastores.postgres.repositories.route import PostgresRouteRepository
from shadowbot.datastores.postgres.repositories.track import PostgresTrackRepository
from shadowbot.datastores.postgres.session import get_session, init_db

settings = Settings()


@asynccontextmanager
async def postgres_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager to initialize the Postgres database."""
    await init_db(settings.postgres)
    yield


async def get_track_repository() -> AsyncGenerator[PostgresTrackRepository, None]:
    """Dependency injector for PostgresTrackRepository."""
    async with get_session(settings.postgres) as session:
        yield PostgresTrackRepository(session=session)


async def get_route_repository() -> AsyncGenerator[PostgresRouteRepository, None]:
    """Dependency injector for PostgresRouteRepository."""
    async with get_session(settings.postgres) as session:
        yield PostgresRouteRepository(session=session)


async def get_chat_repository() -> AsyncGenerator[PostgresChatRepository, None]:
    """Dependency injector for PostgresChatRepository."""
    async with get_session(settings.postgres) as session:
        yield PostgresChatRepository(session=session)


async def get_point_dataset_repository() -> AsyncGenerator[PostgresPointDatasetRepository, None]:
    """Dependency injector for PostgresPointDatasetRepository."""
    async with get_session(settings.postgres) as session:
        yield PostgresPointDatasetRepository(session=session)


TrackDatastoreDep = Annotated[PostgresTrackRepository, Depends(get_track_repository)]
RouteDatastoreDep = Annotated[PostgresRouteRepository, Depends(get_route_repository)]
ChatDatastoreDep = Annotated[PostgresChatRepository, Depends(get_chat_repository)]
PointDatasetDatastoreDep = Annotated[PostgresPointDatasetRepository, Depends(get_point_dataset_repository)]
