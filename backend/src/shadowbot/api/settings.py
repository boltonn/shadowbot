from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from shadowbot.agent.provider import LLMSettings
from shadowbot.datastores.networkx.config import NetworkXRoutingConfig
from shadowbot.datastores.postgres.config import PostgresConfig
from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig
from shadowbot.integrations.nominatim import GeocodingConfig


class Settings(BaseSettings):
    """Shadowbot service settings, composed from each subsystem's config."""

    host: str = Field(default="0.0.0.0", description="Host to bind the server on")
    port: int = Field(default=8000, description="Port to bind the server on")
    reload: bool = Field(default=True, description="Reload the server on code changes")

    llm: LLMSettings = Field(default_factory=LLMSettings)
    postgres: PostgresConfig = Field(default_factory=PostgresConfig)
    routing: NetworkXRoutingConfig = Field(default_factory=NetworkXRoutingConfig)
    valhalla: ValhallaRoutingConfig = Field(default_factory=ValhallaRoutingConfig)
    geocoding: GeocodingConfig = Field(default_factory=GeocodingConfig)

    model_config = SettingsConfigDict(env_file=".env", env_nested_delimiter="__", extra="ignore")
