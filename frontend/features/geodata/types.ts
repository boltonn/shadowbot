import type { Point, Polygon } from "geojson";
import type { components } from "@/types/generated";

/**
 * Derived from the backend's OpenAPI schema (types/generated.ts) — see the
 * comment atop features/routing/types.ts for why, and what `Defined` does.
 */
type Defined<T> = { [K in keyof T]-?: T[K] };

export type DatasetGeometryKind = components["schemas"]["DatasetGeometryKind"];

/** Unified summary of a dataset of any geometry kind, for the browsing list. */
export type Dataset = Defined<components["schemas"]["Dataset"]>;

export type PaginatedDatasetsResponse = Omit<components["schemas"]["PaginatedDatasetsResponse"], "data"> & {
  data: Dataset[];
};

export type TrackSource = components["schemas"]["TrackSource"];

export type TrackPoint = Defined<Omit<components["schemas"]["TrackPoint"], "geometry">> & { geometry: Point };

export type Track = Defined<components["schemas"]["Track"]>;

export type TrackDetail = Defined<Omit<components["schemas"]["TrackDetail"], "points">> & { points: TrackPoint[] };

export type PointFeature = Defined<Omit<components["schemas"]["PointFeature"], "geometry">> & { geometry: Point };

export type TabularPreview = Defined<components["schemas"]["TabularPreview"]>;

export type PointDataset = Defined<components["schemas"]["PointDataset"]>;

export type PointDatasetDetail = Defined<Omit<components["schemas"]["PointDatasetDetail"], "points">> & {
  points: PointFeature[];
};

export type PolygonFeature = Defined<Omit<components["schemas"]["PolygonFeature"], "geometry">> & {
  geometry: Polygon;
};

export type PolygonDataset = Defined<components["schemas"]["PolygonDataset"]>;

export type PolygonDatasetDetail = Defined<Omit<components["schemas"]["PolygonDatasetDetail"], "polygons">> & {
  polygons: PolygonFeature[];
};

/** Full detail for a dataset of any geometry kind — narrow on `geometryKind`. */
export type DatasetDetail = PointDatasetDetail | TrackDetail | PolygonDatasetDetail;

// Request types keep their natural optionality (defaulted fields may genuinely be omitted).
export type PointFeatureCreate = Omit<components["schemas"]["PointFeatureCreate"], "geometry"> & { geometry: Point };

export type PolygonFeatureCreate = Omit<components["schemas"]["PolygonFeatureCreate"], "geometry"> & {
  geometry: Polygon;
};

export type LabelFeatureRequest = components["schemas"]["LabelFeatureRequest"];

export type LabelTrackPointRequest = components["schemas"]["LabelTrackPointRequest"];

export type BulkTagRequest = components["schemas"]["BulkTagRequest"];
