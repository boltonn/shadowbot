"""Generate a synthetic "day in the life" GeoJSON track for testing.

Simulates a few weeks of a commuter's GPS pings: weekday home<->work trips,
occasional evening gym trips, weekend park trips, and a couple of outlier
trips to a random one-off location — useful for exercising upload, map
rendering, and (later) clustering/outlier-detection without needing a real
GPS export.

Usage:
    uv run python scripts/generate_sample_track.py > sample_track.geojson
    uv run python scripts/generate_sample_track.py --upload --api-url http://localhost:8000
"""

import argparse
import json
import random
from datetime import UTC, datetime, timedelta

import httpx

# Rough coordinates around the default Virginia routing region.
HOME = (-77.4930, 38.7509)
WORK = (-77.0369, 38.9072)
GYM = (-77.2664, 38.8048)
PARK = (-77.2297, 38.8156)
OUTLIER = (-76.6122, 39.2904)  # Baltimore — a one-off, out-of-pattern trip


def _interpolate(
    start: tuple[float, float], end: tuple[float, float], start_time: datetime, steps: int = 8
) -> list[dict]:
    """Points along a straight line between two locations, ~90s apart, with light GPS jitter."""
    points = []
    for i in range(steps + 1):
        fraction = i / steps
        lon = start[0] + (end[0] - start[0]) * fraction + random.uniform(-0.0008, 0.0008)
        lat = start[1] + (end[1] - start[1]) * fraction + random.uniform(-0.0008, 0.0008)
        timestamp = start_time + timedelta(seconds=90 * i)
        points.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "time": timestamp.isoformat(),
                    "speed": round(random.uniform(8.0, 25.0), 1) if 0 < fraction < 1 else 0.0,
                },
            }
        )
    return points


def generate_features(days: int = 21) -> list[dict]:
    features: list[dict] = []
    start_date = datetime.now(UTC) - timedelta(days=days)

    for day in range(days):
        date = start_date + timedelta(days=day)
        is_weekend = date.weekday() >= 5

        if is_weekend:
            if random.random() < 0.6:
                depart = date.replace(hour=10, minute=random.randint(0, 59))
                features += _interpolate(HOME, PARK, depart)
                features += _interpolate(PARK, HOME, depart + timedelta(hours=2))
        else:
            morning = date.replace(hour=8, minute=random.randint(0, 30))
            features += _interpolate(HOME, WORK, morning)

            evening = date.replace(hour=17, minute=30 + random.randint(0, 20))
            if random.random() < 0.4:
                features += _interpolate(WORK, GYM, evening)
                features += _interpolate(GYM, HOME, evening + timedelta(hours=1, minutes=15))
            else:
                features += _interpolate(WORK, HOME, evening)

    # A couple of outlier trips: one-off, out-of-pattern destinations.
    for _ in range(2):
        day_offset = random.randint(0, days - 1)
        depart = (start_date + timedelta(days=day_offset)).replace(hour=13, minute=0)
        features += _interpolate(HOME, OUTLIER, depart, steps=15)

    features.sort(key=lambda f: f["properties"]["time"])
    return features


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument("--name", default="Sample commute (synthetic)")
    parser.add_argument("--upload", action="store_true", help="POST directly to a running backend")
    parser.add_argument("--api-url", default="http://localhost:8000")
    args = parser.parse_args()

    feature_collection = {"type": "FeatureCollection", "features": generate_features(args.days)}

    if not args.upload:
        print(json.dumps(feature_collection))
        return

    files = {"file": ("sample_track.geojson", json.dumps(feature_collection), "application/json")}
    response = httpx.post(f"{args.api_url}/geodata/upload", data={"name": args.name}, files=files)
    response.raise_for_status()
    print(f"Uploaded: {response.json()}")


if __name__ == "__main__":
    main()
