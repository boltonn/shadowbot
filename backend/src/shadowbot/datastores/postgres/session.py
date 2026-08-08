import asyncio
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from shadowbot.datastores.postgres.config import PostgresConfig
from shadowbot.datastores.postgres.tables import Base


@lru_cache(maxsize=1)
def get_async_engine(config: PostgresConfig) -> AsyncEngine:
    """Return a cached AsyncEngine; called once per process."""
    database_url = (
        f"postgresql+asyncpg://{config.username}:{config.password}"
        f"@{config.host}:{config.port}/{config.database}"
    )
    return create_async_engine(
        database_url, pool_size=config.pool_size, max_overflow=config.max_overflow
    )


def get_session(config: PostgresConfig) -> AsyncSession:
    """Create a new session bound to the cached engine.

    expire_on_commit=False: repository methods that commit and then return
    the just-written ORM object would otherwise trigger a lazy-load on
    attribute access post-commit, which fails outside an awaited context.
    """
    return AsyncSession(get_async_engine(config), expire_on_commit=False)


async def init_db(config: PostgresConfig) -> None:
    """Create the postgis extension and all tables."""
    from sqlalchemy import text

    async with get_async_engine(config).begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(Base.metadata.create_all)


def create_tables(config: PostgresConfig) -> None:
    """Create all tables in the database."""
    asyncio.run(init_db(config))
