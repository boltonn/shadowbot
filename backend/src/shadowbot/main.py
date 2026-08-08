from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from shadowbot.api.deps.postgres import postgres_lifespan
from shadowbot.api.routes import agent, geodata, health, routing
from shadowbot.api.settings import Settings

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Combined startup: initialize Postgres (tables + PostGIS extension)."""
    async with postgres_lifespan(app):
        yield


app = FastAPI(title="Shadowbot", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(routing.router)
app.include_router(geodata.router)
app.include_router(agent.router)


def main() -> None:
    """Run the Uvicorn server."""
    uvicorn.run(
        "shadowbot.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
    )


if __name__ == "__main__":
    main()
