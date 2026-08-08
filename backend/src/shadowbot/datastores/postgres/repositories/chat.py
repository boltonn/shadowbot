from datetime import UTC, datetime
from uuid import uuid4

from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shadowbot.datastores.postgres.tables.chat import ChatSessionTable
from shadowbot.schemas.chat import ChatSession


class PostgresChatRepository:
    """Postgres implementation of ChatRepository."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_or_create_session(self, session_id: str | None) -> ChatSession:
        """Fetch a session by ID, or create a new one if session_id is None or unknown."""
        if session_id:
            result = await self.session.execute(
                select(ChatSessionTable).where(ChatSessionTable.id == session_id)
            )
            session_table = result.scalar_one_or_none()
            if session_table is not None:
                return ChatSession.model_validate(session_table)

        session_table = ChatSessionTable(
            id=session_id or str(uuid4()), date_created=datetime.now(UTC), messages=[]
        )
        self.session.add(session_table)
        await self.session.commit()
        return ChatSession.model_validate(session_table)

    async def get_message_history(self, session_id: str) -> list[ModelMessage]:
        """Retrieve a session's pydantic-ai message history, for resuming a run."""
        result = await self.session.execute(
            select(ChatSessionTable.messages).where(ChatSessionTable.id == session_id)
        )
        raw = result.scalar_one_or_none()
        return ModelMessagesTypeAdapter.validate_python(raw) if raw else []

    async def save_message_history(self, session_id: str, messages: list[ModelMessage]) -> None:
        """Persist the full pydantic-ai message history for a session."""
        session_table = await self.session.get_one(ChatSessionTable, session_id)
        session_table.messages = ModelMessagesTypeAdapter.dump_python(messages, mode="json")
        await self.session.commit()
