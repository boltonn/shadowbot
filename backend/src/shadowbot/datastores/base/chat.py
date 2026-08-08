"""Abstract repository interface for chat conversation storage."""

from abc import ABC, abstractmethod

from pydantic_ai.messages import ModelMessage

from shadowbot.schemas.chat import ChatSession


class ChatRepository(ABC):
    """Abstract base class for chat datastores."""

    @abstractmethod
    async def get_or_create_session(self, session_id: str | None) -> ChatSession:
        """Fetch a session by ID, or create a new one if session_id is None or unknown."""

    @abstractmethod
    async def get_message_history(self, session_id: str) -> list[ModelMessage]:
        """Retrieve a session's pydantic-ai message history, for resuming a run."""

    @abstractmethod
    async def save_message_history(self, session_id: str, messages: list[ModelMessage]) -> None:
        """Persist the full pydantic-ai message history for a session."""
