from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import Field

from shadowbot.schemas.base import CamelModel


class ChatRole(StrEnum):
    """Speaker of a chat message."""

    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(CamelModel):
    """A single turn in a chat session."""

    id: str
    session_id: str
    role: ChatRole
    content: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    date_created: datetime


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
