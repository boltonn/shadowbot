from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class NetworkXRoutingConfig(BaseModel):
    """Deployment-level configuration for the pure-Python (osmnx + networkx) routing backend.

    Deliberately doesn't fix a region or network type — those vary per request
    (see RouteRequest/IsochroneRequest.network_type) and graphs are fetched
    on-demand for whatever area a request actually needs, not a pre-configured
    one, so routing works anywhere without a config change or a slow upfront
    fetch of a huge region.
    """

    cache_dir: Path = Field(
        default=Path.home() / "data" / "openstreetmap",
        description="Directory where cached .graphml road network graphs are stored",
    )

    @field_validator("cache_dir", mode="after")
    @classmethod
    def _expand_cache_dir(cls, value: Path) -> Path:
        return value.expanduser()

    model_config = {"frozen": True}

    def __hash__(self) -> int:
        """Declared explicitly so this type-checks as Hashable for its use as an lru_cache key."""
        return hash(self.cache_dir)
