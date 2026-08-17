import type { Polygon } from "geojson";
import type { components } from "@/types/generated";

type Defined<T> = { [K in keyof T]-?: T[K] };

export type CoverageRegion = Defined<Omit<components["schemas"]["CoverageRegion"], "bounds">> & {
  bounds: Polygon;
};

export type RoutingCoverage = Defined<Omit<components["schemas"]["RoutingCoverage"], "regions">> & {
  regions: CoverageRegion[];
};
