from datetime import datetime

from pydantic import Field

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


class AgentConfig(CamelModel):
    """Server-side agent configuration exposed to the frontend."""

    has_server_key: bool = Field(
        description="Whether the server can run the agent without a client-supplied API key"
    )
