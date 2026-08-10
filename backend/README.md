# Backend

## Postgres

Tracks, computed routes, and chat sessions are stored in Postgres, run via Docker
Compose (`docker-compose.yml`):

```bash
docker compose up -d postgres
```

Matches the `POSTGRES__*` defaults in `.env.example` (port 5433, db/user/password
`shadowbot`). Data persists in the `postgres_data` volume across restarts.

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
