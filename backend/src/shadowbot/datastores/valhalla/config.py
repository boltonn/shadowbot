from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class ValhallaRoutingConfig(BaseModel):
    """Deployment-level configuration for the Valhalla routing backend.

    Optional — this backend only activates when tile_uri is set (see
    api/deps/routing.py); otherwise routing falls back to the pure-Python
    networkx backend, which needs no pre-built data. Tiles are read in-process
    via pyvalhalla (mmap), not through a separate Valhalla service.
    """

    tile_uri: str | None = Field(
        default=None,
        description=(
            "Location of a pre-built Valhalla tile set: either a single .tar extract "
            "(from valhalla_build_extract — preferred, loads fastest) or a tile "
            "directory (from valhalla_build_tiles). A local filesystem path, or an "
            "s3://bucket/key URI pointing at a .tar extract, downloaded once into "
            "cache_dir on first use. Leave unset to use the networkx backend instead."
        ),
    )
    cache_dir: Path = Field(
        default=Path.home() / "data" / "valhalla",
        description="Local directory used to cache a tile extract downloaded from S3",
    )
    coverage_uri: str | None = Field(
        default=None,
        description=(
            "Location of the coverage.json manifest describing which regions have fast, "
            "pre-compiled tile coverage — written by scripts/build_valhalla_tiles.py next to "
            "tiles.tar. A local path or s3:// URI, same rules as tile_uri. Leave unset to derive "
            "it as a 'coverage.json' sibling of tile_uri."
        ),
    )

    @field_validator("cache_dir", mode="after")
    @classmethod
    def _expand_cache_dir(cls, value: Path) -> Path:
        return value.expanduser()

    model_config = {"frozen": True}
