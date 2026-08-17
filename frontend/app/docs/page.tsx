import {
  ArrowLeft,
  Clock,
  Database,
  GitCompare,
  History,
  Layers,
  Locate,
  MapPin,
  MapPinned,
  Radar,
  Route,
  RouteOff,
  Waypoints,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import { CoverageDialog } from "@/features/coverage/components/coverage-dialog";

export const metadata: Metadata = {
  title: "Shadowbot — Field Manual",
  description:
    "Reference for Shadowbot's routing, geocoding, and track-intelligence tools.",
};

type Confidence =
  | "DETERMINISTIC"
  | "HEURISTIC"
  | "STATISTICAL"
  | "RAW DATA"
  | "EXTERNAL LOOKUP";

const confidenceStyle: Record<Confidence, string> = {
  DETERMINISTIC: "border-trace/40 bg-trace/10 text-trace",
  HEURISTIC: "border-signal/40 bg-signal/10 text-signal",
  STATISTICAL: "border-trace/40 bg-trace/10 text-trace",
  "RAW DATA": "border-border bg-muted text-muted-foreground",
  "EXTERNAL LOOKUP": "border-border bg-muted text-muted-foreground",
};

interface ToolSpec {
  code: string;
  name: string;
  functions: string;
  icon: ComponentType<{ className?: string }>;
  method: string;
  confidence: Confidence;
  description: string;
}

interface ToolGroup {
  label: string;
  tools: ToolSpec[];
}

const toolGroups: ToolGroup[] = [
  {
    label: "Geocoding",
    tools: [
      {
        code: "GEO-01",
        name: "Place Lookup",
        functions: "geocode",
        icon: MapPin,
        method: "Nominatim (OpenStreetMap Search API)",
        confidence: "EXTERNAL LOOKUP",
        description:
          "Resolves free-text place names — “Central Park,” a street address — into coordinates via the public or self-hosted Nominatim service. A regex fallback strips the mailing city and retries on just street + ZIP when a house number's real OSM jurisdiction doesn't match its USPS mailing city, which is common for unincorporated county addresses. Nominatim's parser fails hard on that mismatch rather than fuzzy-matching, so the fallback recovers a result that would otherwise come back empty.",
      },
    ],
  },
  {
    label: "Routing",
    tools: [
      {
        code: "RTE-01",
        name: "Route Planning",
        functions: "plan_route",
        icon: Route,
        method:
          "Dijkstra shortest path (NetworkX) over a cached OSM road graph (OSMnx)",
        confidence: "DETERMINISTIC",
        description:
          "Plans a route across an origin, destination, and any ordered waypoints as one continuous multi-stop path over a locally cached OpenStreetMap road graph. Avoidance preferences — tolls, highways, unpaved surfaces, ferries, hand-drawn exclusion polygons — aren't costed as penalties. They mask the matching edges to infinite weight, so Dijkstra's shortest path can never select them, not just discourage them.",
      },
      {
        code: "RTE-02",
        name: "Reroute",
        functions: "reroute",
        icon: RouteOff,
        method: "Dijkstra shortest path + prior-path exclusion buffer",
        confidence: "DETERMINISTIC",
        description:
          "Recomputes a previously planned route under new constraints. Can also buffer the prior route's own line by roughly 30m and add it as an exclusion polygon, forcing the new route away from the old one entirely rather than just re-optimizing around it.",
      },
      {
        code: "RTE-03",
        name: "Route Comparison",
        functions: "compare_routes",
        icon: GitCompare,
        method: "Geometric buffer-intersection",
        confidence: "DETERMINISTIC",
        description:
          "Buffers each route's line geometry and intersects it against the other to compute what fraction of both paths overlap, alongside the raw distance and duration deltas — a real number for “is this detour worth it” instead of eyeballing two lines on a map.",
      },
      {
        code: "RTE-04",
        name: "Arrival Estimate",
        functions: "estimate_arrival",
        icon: Clock,
        method: "Time-of-day / day-of-week congestion multiplier",
        confidence: "HEURISTIC",
        description:
          "Applies a static multiplier to a route's free-flow duration based on departure weekday and hour: the biggest bump at weekday rush hours, a smaller one across weekday midday, and a modest one during weekend errand-running hours. There's no live traffic feed available offline, so this is a schedule heuristic, not a real-time estimate — and it says so if asked.",
      },
      {
        code: "RTE-05",
        name: "Isochrone",
        functions: "get_isochrone",
        icon: Radar,
        method: "Multi-source Dijkstra + concave hull",
        confidence: "DETERMINISTIC",
        description:
          "Answers “what's reachable within N minutes” by running a time-bounded Dijkstra search outward from a point over the real road network, then wrapping every node reached within the cutoff in a concave hull so the resulting shape follows the actual street layout instead of a naive circle.",
      },
      {
        code: "RTE-06",
        name: "Coverage Awareness",
        functions: "get_routing_coverage · suggest_coverage_request_url",
        icon: Layers,
        method: "Deployment-level coverage.json manifest, checked on demand",
        confidence: "DETERMINISTIC",
        description:
          "Reports which regions, if any, have fast, pre-compiled Valhalla routing on this deployment — visible on the map itself as a dashed overlay with a legend (top-right), and to the agent as a tool it checks before promising fast routing somewhere untested, or after a route/isochrone call fails outside every compiled region. Either way, it can hand back a pre-filled GitHub issue link to request that a region be added. Only meaningful when the Valhalla backend is configured; the NetworkX fallback has no notion of covered regions since it routes live, everywhere, just slower.",
      },
    ],
  },
  {
    label: "Points of Interest",
    tools: [
      {
        code: "POI-01",
        name: "Nearby Search",
        functions: "find_nearby_poi",
        icon: MapPinned,
        method:
          "Overpass tag query, ranked by straight-line distance or Valhalla drive-time matrix",
        confidence: "DETERMINISTIC",
        description:
          "Searches OpenStreetMap tags — amenity=fuel, shop=supermarket, and similar — within a radius of a point, across one or more categories in a single call, with an optional name or brand fuzzy match. Ranked by straight-line distance by default; when the Valhalla routing backend is configured, the closest candidates by air are instead re-ranked by real drive time via a one-to-many time-distance matrix, since the nearest POI by straight line isn't always the nearest by road.",
      },
      {
        code: "POI-02",
        name: "Route Corridor Search",
        functions: "find_poi_along_route",
        icon: Waypoints,
        method: "Overpass tag query within a route-buffer corridor",
        confidence: "DETERMINISTIC",
        description:
          "The same tag search as Nearby Search, but scoped to a buffer around a previously planned route's geometry instead of a point — “find a gas station on the way” rather than “near me,” so a stop can be chained onto the route as a waypoint.",
      },
    ],
  },
  {
    label: "Track Intelligence",
    tools: [
      {
        code: "TRK-01",
        name: "Track Retrieval",
        functions: "list_tracks · get_track",
        icon: Database,
        method: "Stored GPS point history",
        confidence: "RAW DATA",
        description:
          "Lists uploaded GPS tracks and retrieves a track's full recorded point history by ID — the raw material every track-intelligence tool below is built from.",
      },
      {
        code: "TRK-02",
        name: "Frequented Locations",
        functions: "find_frequented_locations",
        icon: History,
        method: "Stay-point extraction + DBSCAN clustering (haversine)",
        confidence: "STATISTICAL",
        description:
          "Two-stage place-mining, following the standard stay-point-extraction approach for GPS trajectory data (Li et al., 2008). First, consecutive points that stay within a radius of each other for a minimum dwell time collapse into a single “stay point,” so one long stop counts once regardless of GPS sampling rate and slowly driving past a place doesn't count at all. Then every track's stay points are clustered by proximity with DBSCAN over haversine distance, so the same place visited on different days collapses into one location — ranked by visit count, for “where do they usually go” rather than reasoning over a single track.",
      },
      {
        code: "TRK-03",
        name: "Map Matching",
        functions: "match_track",
        icon: Locate,
        method: "Hidden Markov Model map matching (Valhalla Meili)",
        confidence: "STATISTICAL",
        description:
          "Snaps a track's raw, noisy GPS points onto the road network it most likely actually drove, reconstructing real distance, duration, and path geometry instead of the raw pings' straight-line jitter. Valhalla-only — there's no networkx equivalent, so this is unavailable unless the Valhalla routing backend is configured, and says so rather than guessing a road from raw points.",
      },
    ],
  },
];

const stack = [
  {
    label: "Agent",
    detail:
      "FastAPI + pydantic-ai, streamed to the client over the Vercel AI SDK protocol",
  },
  {
    label: "Routing engine",
    detail:
      "NetworkX + OSMnx over a locally cached OpenStreetMap road graph by default; optionally Valhalla, in-process over pre-built tiles, which also unlocks map matching, drive-time POI ranking, and fast routing within whichever regions have been compiled (see Coverage Awareness, and the map's coverage overlay)",
  },
  {
    label: "Geocoding & POI",
    detail: "Nominatim search and Overpass tag queries",
  },
  {
    label: "Persistence",
    detail: "Postgres for saved routes, tracks, and chat history",
  },
  {
    label: "Console",
    detail:
      "Next.js, MapLibre GL, and the Vercel AI SDK for the chat interface",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Image
          src="/logo.png"
          alt="Shadowbot"
          width={24}
          height={24}
          className="size-6 rounded-full"
        />
        <span className="font-mono text-xs font-medium tracking-[0.2em] text-foreground uppercase">
          Shadowbot
        </span>
        <Link
          href="/"
          className="ml-auto flex items-center gap-1.5 font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-signal"
        >
          <ArrowLeft className="size-3.5" />
          Return to console
        </Link>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(transparent, transparent 3px, currentColor 3px, currentColor 4px)",
          }}
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16 text-center sm:py-24 md:flex-row md:items-center md:gap-12 md:text-left">
          <Image
            src="/logo-full.png"
            alt="Shadowbot"
            width={1024}
            height={1536}
            priority
            className="h-56 w-auto shrink-0 select-none sm:h-72 md:h-96"
          />
          <div className="flex flex-col items-center gap-4 md:items-start">
            <span className="font-mono text-[11px] tracking-[0.3em] text-signal uppercase">
              Field Manual
            </span>
            <h1 className="font-mono text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Shadowbot
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              An offline geolocation console: plan routes, triage points of
              interest, and mine GPS track history for patterns — all over
              locally cached map data, no live network dependency required.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="font-mono text-xs font-medium tracking-[0.2em] text-signal uppercase">
          Console Modules
        </h2>
        <div className="mt-6 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
          {[
            {
              name: "Chat",
              detail:
                "A conversational agent with the full tool set below — ask for a route, or what a location in an uploaded track might be.",
            },
            {
              name: "Routes",
              detail:
                "Plan, reroute, and compare routes directly, with avoidance constraints and arrival estimates.",
            },
            {
              name: "Data",
              detail:
                "Browse uploaded tracks, points, and polygons, plus whatever the agent has plotted from chat — synced live with the map.",
            },
          ].map((mod) => (
            <div
              key={mod.name}
              className="flex flex-col gap-2 bg-background p-5"
            >
              <span className="font-mono text-[11px] tracking-[0.15em] text-foreground uppercase">
                {mod.name}
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {mod.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="font-mono text-xs font-medium tracking-[0.2em] text-signal uppercase">
          Tools &amp; Algorithms
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every action the agent can take, and the algorithm behind it. Each
          entry is tagged by how much to trust its output at face value:
          deterministic and statistical methods compute an exact answer from
          real data, heuristic methods estimate from a rule of thumb.
        </p>

        <div className="mt-8 flex flex-col gap-10">
          {toolGroups.map((group) => (
            <div key={group.label}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-mono text-[11px] tracking-[0.15em] text-trace uppercase">
                  {group.label}
                </h3>
                {group.label === "Routing" && (
                  <CoverageDialog
                    trigger={
                      <button
                        type="button"
                        className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-signal"
                      >
                        View current coverage →
                      </button>
                    }
                  />
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.tools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <article
                      key={tool.code}
                      className="flex flex-col gap-3 border border-border bg-card p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Icon className="size-4 shrink-0 text-signal" />
                          <div>
                            <div className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                              {tool.code}
                            </div>
                            <div className="text-sm font-medium text-foreground">
                              {tool.name}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase ${confidenceStyle[tool.confidence]}`}
                        >
                          {tool.confidence}
                        </span>
                      </div>
                      <code className="font-mono text-[11px] text-muted-foreground">
                        {tool.functions}
                      </code>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {tool.description}
                      </p>
                      <div className="mt-auto border-t border-border pt-2.5 font-mono text-[10px] tracking-[0.05em] text-foreground/70 uppercase">
                        {tool.method}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="font-mono text-xs font-medium tracking-[0.2em] text-signal uppercase">
          Architecture
        </h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {stack.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4"
            >
              <dt className="font-mono text-[11px] tracking-[0.1em] text-foreground uppercase">
                {row.label}
              </dt>
              <dd className="text-sm text-muted-foreground">{row.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
        Shadowbot — Offline Geolocation Triage, Routing, and Tracking
      </footer>
    </div>
  );
}
