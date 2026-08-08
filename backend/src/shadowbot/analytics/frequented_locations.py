"""Finds places a person visits often from their GPS track history.

Two stages, following the standard stay-point-extraction approach for GPS
trajectory mining (Li et al., 2008): first collapse each track's raw points into
"stay points" — places where consecutive points stayed within radius_m of each
other for at least min_dwell_s — so a visit is counted once regardless of GPS
sampling rate, not confused with slow driving or a loop. Then cluster stay points
across all tracks by proximity (DBSCAN, haversine distance) so the same place
visited on different days collapses into one location.
"""

from dataclasses import dataclass
from datetime import datetime
from math import asin, cos, radians, sin, sqrt

import numpy as np
from geojson_pydantic import Point
from sklearn.cluster import DBSCAN

from shadowbot.schemas.track import FrequentedLocation, LocationCategoryGuess, TrackPoint

_EARTH_RADIUS_M = 6_371_000

_NIGHT_HOUR_START = 19
_NIGHT_HOUR_END = 6
_WORKDAY_MORNING_HOURS = range(5, 11)
_MIN_VISITS_TO_CLASSIFY = 2


@dataclass
class _StayPoint:
    lon: float
    lat: float
    date_arrival: datetime
    date_departure: datetime


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_M * asin(sqrt(h))


def _extract_stay_points(points: list[TrackPoint], radius_m: float, min_dwell_s: float) -> list[_StayPoint]:
    """Collapse one track's consecutive points into stay points (one per dwell episode)."""
    stay_points = []
    points = sorted(points, key=lambda p: p.date_recorded)
    i, n = 0, len(points)
    while i < n:
        j = i + 1
        anchor_lon, anchor_lat = points[i].geometry.coordinates[:2]
        while j < n:
            lon, lat = points[j].geometry.coordinates[:2]
            if _haversine_m(anchor_lon, anchor_lat, lon, lat) > radius_m:
                break
            j += 1
        dwell_s = (points[j - 1].date_recorded - points[i].date_recorded).total_seconds()
        if dwell_s >= min_dwell_s:
            window = points[i:j]
            stay_points.append(
                _StayPoint(
                    lon=sum(p.geometry.coordinates[0] for p in window) / len(window),
                    lat=sum(p.geometry.coordinates[1] for p in window) / len(window),
                    date_arrival=points[i].date_recorded,
                    date_departure=points[j - 1].date_recorded,
                )
            )
            i = j
        else:
            i += 1
    return stay_points


def _is_night_hour(hour: int) -> bool:
    return hour >= _NIGHT_HOUR_START or hour < _NIGHT_HOUR_END


def _guess_category(cluster: list[_StayPoint]) -> str:
    """Guess home/work from visit timing; anything else is left unknown for the person to label."""
    if len(cluster) < _MIN_VISITS_TO_CLASSIFY:
        return LocationCategoryGuess.UNKNOWN

    avg_dwell_h = sum((sp.date_departure - sp.date_arrival).total_seconds() for sp in cluster) / len(cluster) / 3600
    night_share = sum(_is_night_hour(sp.date_arrival.hour) for sp in cluster) / len(cluster)
    if night_share >= 0.6 and avg_dwell_h >= 4:
        return LocationCategoryGuess.HOME

    weekday_visits = [sp for sp in cluster if sp.date_arrival.weekday() < 5]
    if weekday_visits:
        morning_start_share = sum(sp.date_arrival.hour in _WORKDAY_MORNING_HOURS for sp in weekday_visits) / len(
            weekday_visits
        )
        if morning_start_share >= 0.6 and 2 <= avg_dwell_h <= 12:
            return LocationCategoryGuess.WORK

    return LocationCategoryGuess.UNKNOWN


def compute_frequented_locations(
    points_by_track: list[list[TrackPoint]],
    radius_m: float,
    min_dwell_s: float,
    min_visits: int,
    limit: int,
) -> list[FrequentedLocation]:
    """Find places visited more than once across one or more tracks' point histories."""
    stay_points = [
        stay_point
        for points in points_by_track
        for stay_point in _extract_stay_points(points, radius_m=radius_m, min_dwell_s=min_dwell_s)
    ]
    if not stay_points:
        return []

    coords_rad = np.radians([[sp.lat, sp.lon] for sp in stay_points])
    labels = DBSCAN(eps=radius_m / _EARTH_RADIUS_M, min_samples=1, metric="haversine").fit_predict(coords_rad)

    clusters: dict[int, list[_StayPoint]] = {}
    for label, stay_point in zip(labels, stay_points, strict=True):
        clusters.setdefault(int(label), []).append(stay_point)

    locations = []
    for cluster in clusters.values():
        if len(cluster) < min_visits:
            continue
        locations.append(
            FrequentedLocation(
                geometry=Point(
                    type="Point",
                    coordinates=(
                        sum(sp.lon for sp in cluster) / len(cluster),
                        sum(sp.lat for sp in cluster) / len(cluster),
                    ),
                ),
                visit_count=len(cluster),
                total_dwell_s=sum((sp.date_departure - sp.date_arrival).total_seconds() for sp in cluster),
                date_first_visit=min(sp.date_arrival for sp in cluster),
                date_last_visit=max(sp.date_arrival for sp in cluster),
                category=_guess_category(cluster),
            )
        )

    locations.sort(key=lambda location: location.visit_count, reverse=True)
    return locations[:limit]
