from datetime import datetime
from typing import Any
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import ARRAY, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shadowbot.datastores.postgres.tables.base import Base


class PolygonDatasetTable(Base):
    """Polygon dataset table model for Postgres."""

    __tablename__ = "polygon_dataset"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    polygons: Mapped[list["PolygonDatasetFeatureTable"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class PolygonDatasetFeatureTable(Base):
    """Polygon dataset feature table model for Postgres."""

    __tablename__ = "polygon_dataset_feature"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    dataset_id: Mapped[str] = mapped_column(
        String, ForeignKey("polygon_dataset.id"), nullable=False, index=True
    )
    geom: Mapped[Any] = mapped_column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    dataset: Mapped["PolygonDatasetTable"] = relationship(back_populates="polygons")
