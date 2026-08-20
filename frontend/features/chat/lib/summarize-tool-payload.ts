const GEOMETRY_TYPES = new Set([
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeometry(value: unknown): value is { type: string; coordinates: unknown } {
  return isRecord(value) && typeof value.type === "string" && GEOMETRY_TYPES.has(value.type) && "coordinates" in value;
}

function countPositions(coordinates: unknown): number {
  if (!Array.isArray(coordinates)) return 0;
  if (typeof coordinates[0] === "number") return 1;
  return coordinates.reduce((sum: number, entry) => sum + countPositions(entry), 0);
}

// Keyed by the exact object/array reference so a re-render that walks the same, already-finished
// tool payload (large area-search results with full OSM boundaries are re-encountered on every
// message-list render while the chat is streaming) doesn't redo the recursive walk each time.
const cache = new WeakMap<object, unknown>();

/**
 * Replaces a Polygon/LineString/etc.'s coordinate array with a point-count summary so the chat
 * trace's raw tool JSON doesn't dump full route/boundary geometry — already visible on the map —
 * inline. Point geometry (a single coordinate pair) is left as-is since it's already compact.
 */
export function summarizeToolPayload(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  const cached = cache.get(value);
  if (cached !== undefined) return cached;

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map(summarizeToolPayload);
  } else if (isGeometry(value)) {
    result =
      value.type === "Point"
        ? value
        : { ...value, coordinates: `[${countPositions(value.coordinates)} points — see map]` };
  } else {
    result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, summarizeToolPayload(val)]),
    );
  }
  cache.set(value, result);
  return result;
}
