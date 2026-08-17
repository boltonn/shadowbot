"""Resolves a configured tile_uri (local path or s3:// URI) to a local path pyvalhalla can load."""

from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig


def resolve_tile_path(config: ValhallaRoutingConfig) -> Path:
    """Return a local path to the tile extract/directory, downloading it from S3 on first use."""
    if config.tile_uri is None:
        raise ValueError("ROUTING__VALHALLA__TILE_URI (or VALHALLA__TILE_URI) is not set")
    return resolve_uri(config.tile_uri, cache_dir=config.cache_dir)


def resolve_uri(uri: str, *, cache_dir: Path) -> Path:
    """Return a local path for a local-path-or-s3:// URI, downloading it from S3 on first use.

    Shared by resolve_tile_path (the tile extract/directory) and the coverage manifest
    loader (datastores/valhalla/coverage.py) — same caching rules, different files.
    """
    if not uri.startswith("s3://"):
        return Path(uri).expanduser()

    try:
        import boto3
    except ImportError as exc:
        raise ImportError(
            "An s3:// URI was given but boto3 isn't installed — run `uv sync --extra valhalla`."
        ) from exc

    parsed = urlparse(uri)
    bucket, key = parsed.netloc, parsed.path.lstrip("/")
    local_path = cache_dir / Path(key).name
    if local_path.exists():
        logger.info(f"Using cached copy of {uri} at {local_path}")
        return local_path

    cache_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading {uri} to {local_path}")
    boto3.client("s3").download_file(bucket, key, str(local_path))
    logger.info(f"Cached {uri} to {local_path}")
    return local_path
