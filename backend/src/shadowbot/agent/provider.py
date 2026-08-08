"""Builds a pydantic-ai Model from config, independent of which provider is active.

Swapping LLM__PROVIDER (and LLM__BASE_URL for openai_compatible) is a config
change, not a code change — including pointing openai_compatible at a future
local server.
"""

from enum import StrEnum

from pydantic import BaseModel, Field, field_validator
from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.openai import OpenAIProvider


class LLMProvider(StrEnum):
    """Which pydantic-ai model backend to build."""

    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI_COMPATIBLE = "openai_compatible"


class LLMSettings(BaseModel):
    """Agent model configuration."""

    provider: LLMProvider = Field(default=LLMProvider.GOOGLE)
    model: str = Field(default="gemini-2.5-flash")
    api_key: str | None = Field(default=None, description="Falls back to the provider's own env var if unset")
    base_url: str | None = Field(
        default=None,
        description="Required for openai_compatible (e.g. a local server); optional override otherwise",
    )

    model_config = {"frozen": True}

    @field_validator("api_key", "base_url", mode="before")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        """Treat a blank .env value (`LLM__BASE_URL=`) the same as an absent one.

        An empty string isn't None, so it survives past the provider's own
        "is this set?" checks and reaches the underlying SDK client, which (for
        Google in particular) treats an explicit empty base_url as an override
        rather than "unset" — clobbering its own correctly-computed default.
        """
        return value or None


def build_model(settings: LLMSettings) -> Model:
    """Construct the configured pydantic-ai Model."""
    if settings.provider == LLMProvider.ANTHROPIC:
        return AnthropicModel(
            settings.model,
            provider=AnthropicProvider(api_key=settings.api_key, base_url=settings.base_url),
        )
    if settings.provider == LLMProvider.GOOGLE:
        assert settings.api_key is not None, "Google LLM requires an API key"
        return GoogleModel(
            settings.model,
            provider=GoogleProvider(api_key=settings.api_key, base_url=settings.base_url),
        )
    if settings.provider == LLMProvider.OPENAI_COMPATIBLE:
        return OpenAIChatModel(
            settings.model,
            provider=OpenAIProvider(api_key=settings.api_key, base_url=settings.base_url),
        )
    raise ValueError(f"Unsupported LLM provider: {settings.provider}")
