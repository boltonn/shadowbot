import type { LineString, Point, Polygon } from "geojson";

export type GeocodeResult = {
  displayName: string;
  geometry: Point;
  placeType: string | null;
};

export type AvoidancePreferences = {
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidUnpaved: boolean;
  avoidFerries: boolean;
  excludePolygons: Polygon[];
};

export const defaultAvoidance: AvoidancePreferences = {
  avoidTolls: false,
  avoidHighways: false,
  avoidUnpaved: false,
  avoidFerries: false,
  excludePolygons: [],
};

export type NetworkType = "drive" | "drive_service" | "walk" | "bike" | "all";

export type RouteRequest = {
  origin: Point;
  destination: Point;
  waypoints?: Point[];
  networkType?: NetworkType;
  avoid: AvoidancePreferences;
};

export type RerouteRequest = {
  avoid: AvoidancePreferences;
  avoidPriorRoute: boolean;
};

export type Route = {
  id: string;
  geometry: LineString;
  distanceM: number;
  durationS: number;
  origin: Point;
  destination: Point;
  waypoints: Point[];
  networkType: NetworkType;
  avoid: AvoidancePreferences;
  dateCreated: string;
};
