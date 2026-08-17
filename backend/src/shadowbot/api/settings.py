from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from shadowbot.agent.provider import LLMSettings
from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.datastores.postgres.config import PostgresConfig
from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig
from shadowbot.integrations.nominatim import NominatimConfig
from shadowbot.integrations.overpass import OverpassConfig


class Settings(BaseSettings):
    """Shadowbot service settings, composed from each subsystem's config."""

    host: str = Field(default="0.0.0.0", description="Host to bind the server on")
    port: int = Field(default=8000, description="Port to bind the server on")
    reload: bool = Field(default=True, description="Reload the server on code changes")
    github_repo: str = Field(
        default="boltonn/shadowbot", description="owner/repo used to build 'request coverage' issue links"
    )
    osm_website_url: str = Field(
        default="https://www.openstreetmap.org",
        description=(
            "Base URL for linking a result back to its raw node/way/relation page — used by geocode, "
            "POI, and area-feature results alike, so it's a deployment-wide setting rather than owned "
            "by whichever integration (Nominatim, Overpass) happened to resolve a given result. Point "
            "it at a self-hosted OSM website mirror for a fully offline deployment."
        ),
    )

    llm: LLMSettings = Field(default_factory=LLMSettings)
    postgres: PostgresConfig = Field(default_factory=PostgresConfig)
    routing: NetworkXRoutingConfig = Field(default_factory=NetworkXRoutingConfig)
    valhalla: ValhallaRoutingConfig = Field(default_factory=ValhallaRoutingConfig)
    nominatim: NominatimConfig = Field(default_factory=NominatimConfig)
    overpass: OverpassConfig = Field(default_factory=OverpassConfig)

    model_config = SettingsConfigDict(env_file=".env", env_nested_delimiter="__", extra="ignore")
