from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shadowbot.datastores.postgres.tables.base import Base


class ChatSessionTable(Base):
    """Chat session table model for Postgres.

    messages stores the raw pydantic-ai ModelMessage history (serialized via
    ModelMessagesTypeAdapter), which is both the resumption source of truth
    for deferred tool-approval flows and enough to reconstruct a transcript.
    """

    __tablename__ = "chat_session"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
