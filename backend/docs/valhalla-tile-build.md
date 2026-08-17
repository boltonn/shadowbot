# Building Valhalla tiles: Delaware + Virginia

A one-time, offline-capable build: download two small state extracts, then run
Valhalla's bundled build tools (installed via the backend's `valhalla` extra) against
both together as one tile set. No Overpass/Nominatim calls needed for this — those
stay in use for live queries; this is a separate, self-contained batch job. See
`backend/README.md` for how the resulting `tiles.tar` plugs into the app via
`VALHALLA__TILE_URI`.

## The easy way: `scripts/build_valhalla_tiles.py`

Steps 2–3 below (install the build tools, run config/admin/tiles/extract) are wrapped
in `backend/scripts/build_valhalla_tiles.py`. Download a PBF yourself (region, state,
city — wherever you find an extract, e.g. Geofabrik), then:

```bash
cd backend
uv sync --extra valhalla
uv run python scripts/build_valhalla_tiles.py ~/data/openstreetmap/delaware-latest.osm.pbf
uv run python scripts/build_valhalla_tiles.py ~/data/openstreetmap/virginia-latest.osm.pbf
```

Each run adds that PBF's region to `~/data/valhalla/tiles.tar` (every PBF you've ever
passed in gets kept under `~/data/valhalla/sources/` and re-combined on every run —
Valhalla has no true incremental tile-merge, so this is a full rebuild each time, just
one that happens to accumulate). `--data-dir` to use a different location,
`--concurrency`/`-j` to cap threads for a bigger region. The rest of this doc explains
what the script does step by step and why, if you want to run it by hand or adapt it.

## Resource requirements

Checked live as of 2026-08-08, via Geofabrik's
[Delaware](https://download.geofabrik.de/north-america/us/delaware.html) and
[Virginia](https://download.geofabrik.de/north-america/us/virginia.html) extract
pages:

| Resource | Needed | Notes |
|---|---|---|
| Download | ~427 MB total | Delaware 20.9 MB + Virginia 406 MB — you already have the Virginia one at `~/data/openstreetmap/virginia-latest.osm.pbf` |
| Disk | Well under 2 GB, peak | PBFs + intermediate graph dir (deleted after) + final `tiles.tar` |
| RAM | Negligible | Default settings, no tuning needed |
| Time | A minute or two | |

This is small enough that none of the concurrency/OOM caution relevant at whole-US or
whole-planet scale applies here.

## 1. Download the extracts

You already have Virginia (`~/data/openstreetmap/virginia-latest.osm.pbf`, from the
Overpass setup in `docker-compose.yml`). Just add Delaware:

```bash
cd ~/data/openstreetmap
curl -C - -OL https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf
```

## 2. Install the build tools

From `backend/`:

```bash
uv sync --extra valhalla
export PATH="$(pwd)/.venv/bin:$PATH"   # so valhalla_build_* is on PATH for this shell
```

This installs `pyvalhalla`, which bundles the same compiled CLI tools used below
(`valhalla_build_config`, `valhalla_build_admins`, `valhalla_build_tiles`,
`valhalla_build_extract`) — no separate Valhalla install needed.

## 3. Build

All three build tools *accept* multiple PBF files at once, but don't actually do
this — see the gotcha below. Merge the extracts into one file first (via `pyosmium`,
installed by the `valhalla` extra), then build from the single merged file:

```bash
mkdir -p ~/data/valhalla/tiles

python3 -c "
import osmium
reader = osmium.MergeInputReader()
reader.add_file('$HOME/data/openstreetmap/delaware-latest.osm.pbf')
reader.add_file('$HOME/data/openstreetmap/virginia-latest.osm.pbf')
writer = osmium.SimpleWriter('$HOME/data/openstreetmap/merged.osm.pbf')
reader.apply(writer)
writer.close()
"

valhalla_build_config \
  --mjolnir-tile-dir ~/data/valhalla/tiles \
  --mjolnir-tile-extract ~/data/valhalla/tiles.tar \
  > ~/data/valhalla/config.json

valhalla_build_admins -c ~/data/valhalla/config.json \
  ~/data/openstreetmap/merged.osm.pbf

valhalla_build_tiles -c ~/data/valhalla/config.json \
  ~/data/openstreetmap/merged.osm.pbf

# Bundles the many small tile files into one .tar that pyvalhalla mmaps directly —
# this is what actually makes runtime loading fast, not just having the tiles built.
valhalla_build_extract -c ~/data/valhalla/config.json -v
```

> **Gotcha: don't pass multiple PBFs directly, even though the tools accept it.**
> Valhalla's own `valhalla_build_tiles` prints "using more than one osm.pbf extract is
> discouraged" for exactly this reason: two extracts that share a border (e.g. a city
> extract inside its state, or two adjacent states with a shared bridge) can each
> contain the same way/node, and Valhalla's turn-restriction resolver can pathologically
> hang trying to reconcile the duplicates — not a crash, just CPU-pegged and stuck
> indefinitely on "Adding complex turn restrictions." Delaware and Virginia don't
> overlap, so passing them separately happened to work; adding DC (which shares
> Potomac river bridges with Virginia) hung for 10+ hours until merged first. Merging
> up front avoids the problem entirely and costs only a little extra time/disk.
> `scripts/build_valhalla_tiles.py` does this automatically.

## 4. Point shadowbot at it

```bash
# backend/.env
VALHALLA__TILE_URI=/home/boltonn/data/valhalla/tiles.tar
```

Once `tiles.tar` exists and loads correctly, `~/data/valhalla/tiles/` (the exploded
directory) can be deleted to reclaim space — only the `.tar` is read at runtime. The
PBFs are tiny enough to just keep around for a future rebuild.

## Documenting coverage for users

`~/data/valhalla/coverage.json` is a separate, hand-curated manifest — a name, an
optional source URL, and a bounding box per area — read at runtime to show which areas
have fast routing (the coverage dialog, in the console's rail and on `/docs`) and to let
the chat agent reason about coverage gaps. It's deliberately independent of whatever's
actually registered under `sources/` above: an area's entry doesn't need to track 1:1
with what's currently compiled into `tiles.tar`, so this step never requires a rebuild.

Add or update one area at a time with `scripts/describe_coverage_area.py`, pointing it
at *any* PBF that covers that area (its original, unmerged download is ideal — accurate
bounds, no merging needed) and, optionally, the URL you downloaded it from:

```bash
uv run python scripts/describe_coverage_area.py \
  --name "District of Columbia" \
  --url https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf \
  ~/data/openstreetmap/district-of-columbia-latest.osm.pbf

uv run python scripts/describe_coverage_area.py \
  --name "Delaware" \
  --url https://download.geofabrik.de/north-america/us/delaware-latest.osm.pbf \
  ~/data/openstreetmap/delaware-latest.osm.pbf

uv run python scripts/describe_coverage_area.py \
  --name "Virginia" \
  --url https://download.geofabrik.de/north-america/us/virginia-latest.osm.pbf \
  ~/data/openstreetmap/virginia-latest.osm.pbf
```

Bounds come from the PBF's header (or, for a pre-merged input that lacks one, a one-time
node scan). Deploying to a new host or S3 bucket means copying/uploading
`coverage.json` alongside `tiles.tar` — it's resolved as a sibling file by default (or
set `VALHALLA__COVERAGE_URI` explicitly).

## Skipping elevation and timezones

- **Elevation** (`valhalla_build_elevation`): adds elevation-aware costing (e.g. bike
  route hill avoidance) and the `/height` endpoint. Skipped here for simplicity;
  routing, isochrones, and turn-by-turn all work fine without it.
- **Timezones** (`tz_world.sqlite`): pyvalhalla doesn't bundle a timezone-database
  builder tool, and building one from scratch needs a data source beyond the OSM PBF.
  Skipping it just means Valhalla doesn't do timezone-aware local-time conversions
  internally — shadowbot doesn't rely on that (see `_congestion_multiplier` in
  `backend/src/shadowbot/datastores/base/routing.py`, which is its own heuristic, not
  sourced from Valhalla).

## If you want more coverage later

Same tools, same steps — just point `valhalla_build_admins`/`valhalla_build_tiles` at
more/bigger PBF files. Two scaling options, in order:

- **Whole US** (~11.2 GB download, ~40–50 GB peak disk, minutes-to-an-hour build):
  `https://download.geofabrik.de/north-america/us-latest.osm.pbf` in place of the two
  state files.
- **Whole planet** (~88 GB download, ~400–600 GB peak disk, ~1 day+ build, needs
  concurrency tuning to avoid OOM on the build box): see
  `https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf`. Worth reading up on
  Valhalla's own resource guidance first —
  [OSM Planet Data Required Disk Space (valhalla/valhalla#3661)](https://github.com/valhalla/valhalla/discussions/3661)
  and
  [Resources required on full planet build (valhalla/valhalla#4855)](https://github.com/valhalla/valhalla/issues/4855) —
  before attempting it; a naive full-concurrency run has been OOM-killed on machines
  with 32GB RAM.
