"""Builds a pydantic-ai Model from config, independent of which provider is active.

Swapping LLM__PROVIDER (and LLM__BASE_URL for openai_compatible) is a config
change, not a code change — including pointing openai_compatible at a future
local server.
"""

from enum import StrEnum

from openai import AsyncOpenAI
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
    tool_retries: int = Field(
        default=3,
        ge=0,
        le=10,
        description=(
            "How many times the agent may retry a tool call after a validation error or "
            "ModelRetry before giving up and surfacing the failure to the user"
        ),
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


class ModelOption(BaseModel):
    """A selectable model exposed to the frontend's chat model picker."""

    id: str
    provider: LLMProvider
    model: str
    label: str

    model_config = {"frozen": True}


AVAILABLE_MODELS: tuple[ModelOption, ...] = (
    ModelOption(id="claude-sonnet-5", provider=LLMProvider.ANTHROPIC, model="claude-sonnet-5", label="Claude Sonnet 5"),
    ModelOption(id="claude-opus-5", provider=LLMProvider.ANTHROPIC, model="claude-opus-5", label="Claude Opus 5"),
    ModelOption(id="claude-haiku-4-5", provider=LLMProvider.ANTHROPIC, model="claude-haiku-4-5", label="Claude Haiku 4.5"),
    ModelOption(id="gemini-2.5-pro", provider=LLMProvider.GOOGLE, model="gemini-2.5-pro", label="Gemini 2.5 Pro"),
    ModelOption(id="gemini-2.5-flash", provider=LLMProvider.GOOGLE, model="gemini-2.5-flash", label="Gemini 2.5 Flash"),
)


def resolve_llm_settings(base: LLMSettings, model_id: str | None) -> LLMSettings:
    """Overrides base's provider/model with the AVAILABLE_MODELS entry for model_id, if any."""
    option = next((m for m in AVAILABLE_MODELS if m.id == model_id), None)
    if option is None:
        return base
    return base.model_copy(update={"provider": option.provider, "model": option.model})


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
        # The openai SDK retries 429s internally (max_retries=2) before pydantic-ai ever
        # sees the error, bypassing our own no-retry-on-429 handling in the agent route.
        # Disable it here so a 429 surfaces immediately, same as the other providers.
        openai_client = AsyncOpenAI(
            api_key=settings.api_key, base_url=settings.base_url, max_retries=0
        )
        return OpenAIChatModel(
            settings.model,
            provider=OpenAIProvider(openai_client=openai_client),
        )
    raise ValueError(f"Unsupported LLM provider: {settings.provider}")
