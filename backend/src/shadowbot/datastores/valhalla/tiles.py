"""Resolves a configured tile_uri (local path or s3:// URI) to a local path pyvalhalla can load."""

from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

from shadowbot.datastores.valhalla.config import ValhallaRoutingConfig


def resolve_tile_path(config: ValhallaRoutingConfig) -> Path:
    """Return a local path to the tile extract/directory, downloading it from S3 on first use."""
    if config.tile_uri is None:
        raise ValueError("ROUTING__VALHALLA__TILE_URI (or VALHALLA__TILE_URI) is not set")

    if not config.tile_uri.startswith("s3://"):
        return Path(config.tile_uri).expanduser()

    try:
        import boto3
    except ImportError as exc:
        raise ImportError(
            "VALHALLA__TILE_URI is an s3:// URI but boto3 isn't installed — run `uv sync --extra valhalla`."
        ) from exc

    parsed = urlparse(config.tile_uri)
    bucket, key = parsed.netloc, parsed.path.lstrip("/")
    local_path = config.cache_dir / Path(key).name
    if local_path.exists():
        logger.info(f"Using cached Valhalla tile extract at {local_path}")
        return local_path

    config.cache_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading Valhalla tile extract from {config.tile_uri} to {local_path}")
    boto3.client("s3").download_file(bucket, key, str(local_path))
    logger.info(f"Cached Valhalla tile extract to {local_path}")
    return local_path
