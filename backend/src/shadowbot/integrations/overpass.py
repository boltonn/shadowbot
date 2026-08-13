"""osmnx-facing wrapper around Overpass: connection configuration and retry.

osmnx is the actual Overpass client (ox.graph_from_bbox, ox.features_from_polygon
etc.) — this module only owns what's specific to our deployment: pointing osmnx at
a self-hosted instance (optionally over mTLS or a custom CA) and retrying its
frequent transient failures. The free public instance is frequently briefly
overloaded (504 "server too busy", or an outright refused connection under load),
and a retry a few seconds later routinely succeeds — confirmed empirically: the
same query can 504 and then return 200 seconds apart.
"""

import time
from collections.abc import Callable
from pathlib import Path

import osmnx as ox
from loguru import logger
from osmnx._errors import InsufficientResponseError
from pydantic import BaseModel, Field
from requests.exceptions import RequestException

_MAX_ATTEMPTS = 3
_BACKOFF_S = 5


class OverpassConfig(BaseModel):
    """Overpass connection configuration."""

    overpass_url: str = Field(default="https://overpass-api.de/api")
    cert: Path | tuple[Path, Path] | None = Field(
        default=None,
        description="Client cert for mTLS to a self-hosted instance: a single file, or a (cert, key) pair",
    )
    verify: bool | Path = Field(
        default=True, description="CA bundle path to verify against, or False to disable verification"
    )

    model_config = {"frozen": True}

    def __hash__(self) -> int:
        """Declared explicitly so this type-checks as Hashable for its use as an lru_cache key."""
        return hash((self.overpass_url, self.cert, self.verify))


class OverpassClient:
    """Points osmnx at this deployment's Overpass instance and retries transient failures."""

    def __init__(self, config: OverpassConfig):
        self.config = config

    def call_with_retry[T](self, fetch: Callable[[], T]) -> T:
        """Point osmnx at this client's Overpass instance and call fetch, retrying transient failures."""
        ox.settings.overpass_url = self.config.overpass_url
        ox.settings.requests_kwargs = {**ox.settings.requests_kwargs, **self._requests_kwargs()}
        last_error: Exception | None = None
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                return fetch()
            except (RequestException, InsufficientResponseError) as exc:
                last_error = exc
                if attempt < _MAX_ATTEMPTS:
                    logger.warning(
                        f"Overpass request attempt {attempt}/{_MAX_ATTEMPTS} failed ({exc}) — "
                        f"retrying in {_BACKOFF_S}s"
                    )
                    time.sleep(_BACKOFF_S)
        assert last_error is not None
        raise last_error

    def _requests_kwargs(self) -> dict[str, str | bool | tuple[str, str]]:
        verify = self.config.verify if isinstance(self.config.verify, bool) else str(self.config.verify)
        kwargs: dict[str, str | bool | tuple[str, str]] = {"verify": verify}
        if self.config.cert is not None:
            if isinstance(self.config.cert, Path):
                kwargs["cert"] = str(self.config.cert)
            else:
                cert, key = self.config.cert
                kwargs["cert"] = (str(cert), str(key))
        return kwargs
