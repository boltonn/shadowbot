"""Shared retry wrapper for direct Overpass calls (graph tiles and POI queries).

The free public instance is frequently briefly overloaded (504 "server too
busy", or an outright refused connection under load), and a retry a few
seconds later routinely succeeds — confirmed empirically: the same query can
504 and then return 200 seconds apart.
"""

import time
from collections.abc import Callable

from loguru import logger
from osmnx._errors import InsufficientResponseError
from requests.exceptions import RequestException

_MAX_ATTEMPTS = 3
_BACKOFF_S = 5


def with_overpass_retry[T](fetch: Callable[[], T]) -> T:
    """Call fetch, retrying on transient Overpass failures before giving up."""
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
