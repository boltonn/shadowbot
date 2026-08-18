import type { MultiPolygon, Point, Polygon } from "geojson";
import type { components } from "@/types/generated";

/** Strips the `?` openapi-typescript adds to fields without a literal default — the backend always serializes every field on a full model dump. */
type Defined<T> = { [K in keyof T]-?: T[K] };

export type GeocodeRequest = components["schemas"]["GeocodeRequest"];

export type GeocodeResult = Defined<Omit<components["schemas"]["GeocodeResult"], "geometry" | "boundary">> & {
  geometry: Point;
  boundary: Polygon | MultiPolygon | null;
};
