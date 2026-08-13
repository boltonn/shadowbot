"""Schemas for persisted, user-supplied corrections of frequented-location categories."""

from datetime import datetime

from geojson_pydantic import Point
from pydantic import Field

from shadowbot.schemas.base import CamelModel


class LocationLabelCreate(CamelModel):
    """A person's correction or name for a frequented location, e.g. 'that's the gym'."""

    geometry: Point
    category: str
    name: str | None = Field(default=None)


class LocationLabel(LocationLabelCreate):
    """A persisted location label, applied to future frequented-location guesses within range."""

    id: str
    date_created: datetime
