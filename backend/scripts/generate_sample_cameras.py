"""Generate a synthetic set of city camera locations for testing.

Scatters points around the same Virginia/DC routing region used by
generate_sample_track.py, each tagged with a camera "type" property
(vehicle, face, phone, image) — useful for exercising the point-dataset
upload flow and per-category map markers without needing a real camera
registry export.

Usage:
    uv run python scripts/generate_sample_cameras.py > sample_cameras.geojson
    uv run python scripts/generate_sample_cameras.py --upload --api-url http://localhost:8000
"""

import argparse
import json
import random

import httpx

# Same rough Virginia/DC region as generate_sample_track.py.
CENTER = (-77.15, 38.85)
SPREAD_DEG = 0.25

CAMERA_TYPES = ["vehicle", "face", "phone", "image"]


def generate_features(count: int) -> list[dict]:
    features = []
    for i in range(count):
        lon = CENTER[0] + random.uniform(-SPREAD_DEG, SPREAD_DEG)
        lat = CENTER[1] + random.uniform(-SPREAD_DEG, SPREAD_DEG)
        camera_type = random.choice(CAMERA_TYPES)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {"type": camera_type, "name": f"Camera {i + 1} ({camera_type})"},
            }
        )
    return features


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--name", default="Sample city cameras (synthetic)")
    parser.add_argument("--upload", action="store_true", help="POST directly to a running backend")
    parser.add_argument("--api-url", default="http://localhost:8000")
    args = parser.parse_args()

    feature_collection = {"type": "FeatureCollection", "features": generate_features(args.count)}

    if not args.upload:
        print(json.dumps(feature_collection))
        return

    files = {"file": ("sample_cameras.geojson", json.dumps(feature_collection), "application/json")}
    response = httpx.post(
        f"{args.api_url}/geodata/points/upload",
        data={"name": args.name, "type_field": "type"},
        files=files,
    )
    response.raise_for_status()
    print(f"Uploaded: {response.json()}")


if __name__ == "__main__":
    main()
