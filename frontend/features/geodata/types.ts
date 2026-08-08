import type { Point } from "geojson";

export type TrackSource = "geojson" | "gpx" | "synthetic";

export type TrackPoint = {
  id: string;
  trackId: string;
  geometry: Point;
  dateRecorded: string;
  elevationM: number | null;
  speedMps: number | null;
};

export type Track = {
  id: string;
  name: string;
  source: TrackSource;
  pointCount: number;
  dateCreated: string;
  dateStart: string | null;
  dateEnd: string | null;
};

export type TrackDetail = Track & {
  points: TrackPoint[];
};

export type PaginatedTracksResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: Track[];
};

export type PointFeature = {
  id: string;
  datasetId: string;
  geometry: Point;
  category: string;
  name: string | null;
};

export type PointDataset = {
  id: string;
  name: string;
  pointCount: number;
  categories: string[];
  dateCreated: string;
};

export type PointDatasetDetail = PointDataset & {
  points: PointFeature[];
};

export type PaginatedPointDatasetsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: PointDataset[];
};
