from datetime import datetime
from typing import Any
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shadowbot.datastores.postgres.tables.base import Base


class TrackTable(Base):
    """Track table model for Postgres."""

    __tablename__ = "track"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    points: Mapped[list["TrackPointTable"]] = relationship(
        back_populates="track", cascade="all, delete-orphan"
    )


class TrackPointTable(Base):
    """Track point table model for Postgres."""

    __tablename__ = "track_point"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    track_id: Mapped[str] = mapped_column(
        String, ForeignKey("track.id"), nullable=False, index=True
    )
    geom: Mapped[Any] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    date_recorded: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_mps: Mapped[float | None] = mapped_column(Float, nullable=True)

    track: Mapped["TrackTable"] = relationship(back_populates="points")
