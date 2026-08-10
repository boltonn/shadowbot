"""osmnx-facing wrapper around Overpass: base-URL configuration and retry.

osmnx is the actual Overpass client (ox.graph_from_bbox, ox.features_from_polygon
etc.) — this module only owns what's specific to our deployment: pointing osmnx at
a self-hosted instance and retrying its frequent transient failures. The free
public instance is frequently briefly overloaded (504 "server too busy", or an
outright refused connection under load), and a retry a few seconds later routinely
succeeds — confirmed empirically: the same query can 504 and then return 200
seconds apart.
"""

import time
from collections.abc import Callable

import osmnx as ox
from loguru import logger
from osmnx._errors import InsufficientResponseError
from requests.exceptions import RequestException

_MAX_ATTEMPTS = 3
_BACKOFF_S = 5


def call_with_retry[T](*, overpass_url: str, fetch: Callable[[], T]) -> T:
    """Point osmnx at overpass_url and call fetch, retrying transient Overpass failures."""
    ox.settings.overpass_url = overpass_url
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
