from datetime import datetime
from typing import Any
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import ARRAY, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shadowbot.datastores.postgres.tables.base import Base


class PointDatasetTable(Base):
    """Point dataset table model for Postgres."""

    __tablename__ = "point_dataset"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    points: Mapped[list["PointDatasetFeatureTable"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class PointDatasetFeatureTable(Base):
    """Point dataset feature table model for Postgres."""

    __tablename__ = "point_dataset_feature"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    dataset_id: Mapped[str] = mapped_column(
        String, ForeignKey("point_dataset.id"), nullable=False, index=True
    )
    geom: Mapped[Any] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    dataset: Mapped["PointDatasetTable"] = relationship(back_populates="points")
