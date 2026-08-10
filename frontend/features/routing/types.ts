import type { LineString, Point, Polygon } from "geojson";
import type { components } from "@/types/generated";

/**
 * Types are derived from the backend's OpenAPI schema (types/generated.ts, run
 * `npm run generate:types` to refresh) rather than hand-transcribed, so a field
 * renamed/added/removed on the Pydantic side shows up here as a type error
 * instead of silently drifting.
 *
 * Geometry fields (Point/LineString/Polygon) are re-typed to the `geojson`
 * package's types instead of the generated ones, to interop with the rest of
 * the map/geo code (maplibre, turf-style helpers) that already relies on it.
 *
 * `Defined` strips the `?` openapi-typescript adds to any field without a
 * literal (non-factory) default — the backend always serializes every field on
 * a full model dump (no exclude_unset/exclude_none), so response types use it
 * to reflect what's actually always present on the wire. Request types (which
 * genuinely may omit a defaulted field) are left with their natural optionality.
 */
type Defined<T> = { [K in keyof T]-?: T[K] };

export type NetworkType = components["schemas"]["NetworkType"];

export type AvoidancePreferences = Defined<Omit<components["schemas"]["AvoidancePreferences"], "excludePolygons">> & {
  excludePolygons: Polygon[];
};

export type RouteAlternate = Defined<Omit<components["schemas"]["RouteAlternate"], "geometry">> & {
  geometry: LineString;
};

export type RouteLeg = Defined<Omit<components["schemas"]["RouteLeg"], "origin" | "destination" | "geometry">> & {
  origin: Point;
  destination: Point;
  geometry: LineString;
};

export type Route = Defined<
  Omit<
    components["schemas"]["Route"],
    "geometry" | "origin" | "destination" | "waypoints" | "avoid" | "legs" | "alternates"
  >
> & {
  geometry: LineString;
  origin: Point;
  destination: Point;
  waypoints: Point[];
  avoid: AvoidancePreferences;
  legs: RouteLeg[];
  alternates: RouteAlternate[];
};
