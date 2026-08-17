from datetime import datetime

from pydantic import Field

from shadowbot.agent.provider import LLMProvider
from shadowbot.schemas.base import CamelModel


class ChatSession(CamelModel):
    """A persisted chat conversation."""

    id: str
    date_created: datetime


class ChatRequest(CamelModel):
    """A new message sent to the agent."""

    message: str
    session_id: str | None = Field(default=None)
    api_key: str | None = Field(
        default=None, description="Overrides the server-configured LLM API key for this request"
    )
    model_id: str | None = Field(
        default=None, description="Selects a model from AgentConfig.models; falls back to the server default"
    )


class ModelOption(CamelModel):
    """A selectable LLM shown in the frontend's model picker."""

    id: str
    provider: LLMProvider
    label: str
    has_key: bool = Field(
        description="Whether the server can authenticate this model without a client-supplied key"
    )


class AgentConfig(CamelModel):
    """Server-side agent configuration exposed to the frontend."""

    has_server_key: bool = Field(
        description="Whether the server can run the agent without a client-supplied API key"
    )
    models: list[ModelOption] = Field(description="Selectable models for the chat model picker")
    default_model_id: str = Field(description="The model_id used when a chat request omits one")
