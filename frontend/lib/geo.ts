import type { Polygon, Position } from "geojson";

const EARTH_RADIUS_M = 6371000;

/** Approximate circular polygon around a center point, for "avoid this area" exclusion zones. */
export function circlePolygon(
  center: [number, number],
  radiusMeters: number,
  points = 32,
): Polygon {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const coordinates: Position[] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(angle)) / EARTH_RADIUS_M;
    const dLng = (radiusMeters * Math.sin(angle)) / (EARTH_RADIUS_M * Math.cos(latRad));
    coordinates.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }

  return { type: "Polygon", coordinates: [coordinates] };
}

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
 * point-in-polygon test only for the axis-aligned rectangles `bboxPolygon`
 * produces — do not pass it a non-rectangular polygon expecting accuracy.
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
