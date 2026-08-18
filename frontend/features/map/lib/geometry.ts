import type { Point, Polygon } from "geojson";

/** A single representative [lon, lat] for a geometry that might be a Point or a Polygon. */
export function centroidOf(geometry: Point | Polygon): [number, number] {
  if (geometry.type === "Point") {
    return [geometry.coordinates[0], geometry.coordinates[1]];
  }
  const ring = geometry.coordinates[0];
  const [sumLon, sumLat] = ring.reduce(
    ([lon, lat], [x, y]) => [lon + x, lat + y],
    [0, 0],
  );
  return [sumLon / ring.length, sumLat / ring.length];
}
