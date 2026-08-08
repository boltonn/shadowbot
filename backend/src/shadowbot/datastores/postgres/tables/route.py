from datetime import datetime
from typing import Any
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shadowbot.datastores.postgres.tables.base import Base


class RouteTable(Base):
    """Computed route archive table model for Postgres."""

    __tablename__ = "route"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    origin: Mapped[Any] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    destination: Mapped[Any] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    geometry: Mapped[Any] = mapped_column(
        Geometry(geometry_type="LINESTRING", srid=4326), nullable=False
    )
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    avoid: Mapped[dict] = mapped_column(JSONB, nullable=False)
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
