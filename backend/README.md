# Backend

## Postgres

Tracks, computed routes, and chat sessions are stored in Postgres, run via Docker
Compose (`docker-compose.yml`):

```bash
docker compose up -d postgres
```

Matches the `POSTGRES__*` defaults in `.env.example` (port 5433, db/user/password
`shadowbot`). Data persists in the `postgres_data` volume across restarts.

## Geodata: datasets, points, tracks, and polygons

A "dataset" isn't its own table — it's a virtual concept spanning three
independent geometry kinds, each with its own Postgres table pair (parent +
feature) and its own repository:

| Geometry kind | Dataset table    | Feature table            | Feature shape                                               |
| -------------- | ----------------- | -------------------------- | -------------------------------------------------------------- |
| `point`        | `point_dataset`   | `point_dataset_feature`   | `Point` + `category`/`name`/`tags`                              |
| `polygon`      | `polygon_dataset` | `polygon_dataset_feature` | `Polygon` + `category`/`name`/`tags`                            |
| `track`        | `track`           | `track_point`             | `Point` + `date_recorded`/`elevation_m`/`speed_mps`/`tags`     |

Point and polygon features are hand-labeled or uploaded points of interest — a
camera, a restricted zone, a POI — so they carry a user-facing `category` and
`name`. Track points are raw GPS telemetry ordered in time (no category):
they represent where a device actually went, and a track's
`date_start`/`date_end` are derived from `min`/`max(date_recorded)` across its
points rather than set directly.

`DatasetGeometryKind` (`point` | `track` | `polygon`, in `schemas/common.py`)
tags which kind a dataset is. `schemas/dataset.py` defines the surface that
unifies all three for browsing:

- `Dataset` — a geometry-kind-agnostic summary (id, name, feature_count,
  categories, tags, date_created, plus track-only date_start/date_end)
- `DatasetDetail = PointDatasetDetail | TrackDetail | PolygonDatasetDetail` —
  a union covering each kind's full detail (dataset metadata + its features)

`PostgresDatasetRepository` (`datastores/postgres/repositories/dataset.py`)
is a facade, not a table-backed repository — it wraps the three real
repositories (`points`, `tracks`, `polygons`) so callers have one place to
browse across geometry kinds:

- `list_datasets` runs a `UNION ALL` across all three tables to page through
  every dataset regardless of kind
- `get_dataset_detail(id)` tries each geometry kind's repository in turn
  (point → track → polygon) until one recognizes the id
- `download_dataset(id)` serializes any dataset's features to a GeoJSON
  `FeatureCollection`

API-wise, `GET /geodata/datasets`, `GET /geodata/datasets/{id}`, and
`GET /geodata/datasets/{id}/download` are the unified read surface. Writes —
upload, labeling, bulk tagging — go through kind-specific endpoints instead
(e.g. `POST /geodata/datasets/points/upload`,
`PATCH /geodata/datasets/tracks/{id}/features/{feature_id}`), since each
kind's create payload and label rules differ — track points, for instance,
have no category to label.

Track history feeds a separate analytics layer: `FrequentedLocation`
(`schemas/track.py`) clusters a track's dwell periods into places visited
more than once, and `LocationLabel` (`schemas/location_label.py`) stores a
person's correction/name for one of those inferred places. Both are derived
from track datasets, not datasets themselves.

## Local LLM

The agent can run against a locally-hosted model instead of a hosted provider, via an
OpenAI-compatible server. That server (vLLM, `Qwen2.5-32B-Instruct-AWQ`) lives outside
this repo at `~/models/vllm/` (venv, weights, and the actual script) — see
`~/models/vllm/README.md` for details. `make` here just wraps it for convenience:

```bash
make llm-up      # start
make llm-logs    # tail logs
make llm-status  # check it's up
make llm-down    # stop
```

Once it's running, point the agent at it by setting in `.env`:

```bash
LLM__PROVIDER=openai_compatible
LLM__MODEL=Qwen/Qwen2.5-32B-Instruct-AWQ
LLM__API_KEY=<same value as ~/models/vllm/.env's VLLM_API_KEY>
LLM__BASE_URL=http://localhost:8001/v1
```

## Routing: Valhalla (optional, faster)

Routing works out of the box via the pure-Python networkx backend (fetches OSM data
from Overpass on demand, computes shortest paths locally). For faster routing, an
optional Valhalla backend is available: it runs in-process (via
[pyvalhalla](https://pypi.org/project/pyvalhalla/), no separate service) over a
pre-built tile set that you build once, out of band.

1. Install the extra: `uv sync --extra valhalla`
2. Download a PBF extract for whatever region you want (state, city, country —
   Geofabrik or similar) and build tiles from it:

   ```bash
   uv run python scripts/build_valhalla_tiles.py ~/data/openstreetmap/virginia-latest.osm.pbf
   ```

   Every PBF you ever pass to the script gets folded into the same combined tile
   set — run it again with another region's PBF later and both are covered. See
   `docs/valhalla-tile-build.md` for sizing (a couple of states vs. the whole US vs.
   the whole planet) and what the script does under the hood.
3. Point the app at the `tiles.tar` it printed:

   ```bash
   VALHALLA__TILE_URI=/home/boltonn/data/valhalla/tiles.tar
   ```

   To host it in S3 instead (e.g. to share one build across environments), upload
   `tiles.tar` and set `VALHALLA__TILE_URI=s3://<bucket>/<key>.tar` — it's downloaded
   once into `VALHALLA__CACHE_DIR` on first use and reused after that.

Leave `VALHALLA__TILE_URI` unset to keep using the networkx backend for routing,
rerouting, comparison, arrival estimates, and isochrones — nothing else changes;
both backends implement the same routing interface for those.

Two capabilities only exist on the Valhalla backend, with no networkx equivalent:

- **Map matching** (`match_track` tool, `POST /geodata/tracks/{id}/match`): snaps a
  track's raw GPS points onto the roads it actually drove, instead of reasoning over
  noisy raw pings.
- **Drive-time POI ranking**: `find_nearby_poi` automatically ranks by real drive
  time (via Valhalla's matrix) instead of straight-line distance when this backend
  is active — no separate tool, same call, just more accurate.

Both raise a clear error when the networkx backend is active instead of silently
degrading, so the agent can say so rather than guess.
