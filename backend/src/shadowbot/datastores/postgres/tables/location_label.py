from datetime import datetime
from typing import Any
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from shadowbot.datastores.postgres.tables.base import Base


class LocationLabelTable(Base):
    """Location label table model for Postgres."""

    __tablename__ = "location_label"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    geom: Mapped[Any] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
