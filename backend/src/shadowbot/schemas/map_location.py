"""Schemas for agent-controlled location markers on the user's map."""

from enum import StrEnum

from geojson_pydantic import Point, Polygon
from pydantic import Field

from shadowbot.schemas.base import CamelModel


class MapLocationAction(StrEnum):
    """How a set of locations should change what's currently plotted on the map."""

    ADD = "add"
    REPLACE = "replace"
    REMOVE = "remove"


class MapLocation(CamelModel):
    """A single location marker to plot on the user's map."""

    id: str = Field(description="Stable, human-legible id (e.g. a slug of the name) so it can be referenced later")
    kind: str = Field(description="Icon category, e.g. 'hotel', 'gas_station', 'geocode', or a raw 'key=value' tag")
    label: str
    geometry: Point | Polygon = Field(
        description="A Point for most markers; a Polygon for an area feature's actual boundary (e.g. an AreaMatch)"
    )
    properties: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "The raw element detail behind this marker — carry over whatever the source tool "
            "gave you: geocode's osm_type/osm_id/osm_class/url/address, or find_nearby_poi's "
            "osm_type/osm_id/url/raw_tags. Flatten nested fields (e.g. address entries) to "
            "string key/value pairs. The user can inspect this on the map, so don't drop it."
        ),
    )


class UpdateMapLocationsRequest(CamelModel):
    """Directly control what location markers are shown on the user's map."""

    action: MapLocationAction
    locations: list[MapLocation] = Field(
        default_factory=list, description="Locations to show — used for action=add/replace, ignored for remove"
    )
    remove_ids: list[str] = Field(
        default_factory=list, description="Location ids to drop — only used for action=remove"
    )
