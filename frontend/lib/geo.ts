import type { Polygon } from "geojson";

/** Axis-aligned rectangle between two corners, as a GeoJSON Polygon. */
export function bboxPolygon(start: [number, number], end: [number, number]): Polygon {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const west = Math.min(lng1, lng2);
  const east = Math.max(lng1, lng2);
  const south = Math.min(lat1, lat2);
  const north = Math.max(lat1, lat2);

  return {
    type: "Polygon",
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
}

/**
 * Whether a point falls inside a polygon's bounding box. This is a correct
 * point-in-polygon test only for axis-aligned rectangles (e.g. the area-select
 * tool's terra-draw rectangle mode) — do not pass it a non-rectangular polygon
 * expecting accuracy.
 */
export function isPointInBbox(point: [number, number], polygon: Polygon): boolean {
  const [lng, lat] = point;
  const ring = polygon.coordinates[0];
  const lngs = ring.map(([x]) => x);
  const lats = ring.map(([, y]) => y);

  return (
    lng >= Math.min(...lngs) &&
    lng <= Math.max(...lngs) &&
    lat >= Math.min(...lats) &&
    lat <= Math.max(...lats)
  );
}
