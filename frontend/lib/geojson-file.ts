import type { Feature, FeatureCollection, Geometry, GeoJsonGeometryTypes } from "geojson";

/**
 * Parses an uploaded GeoJSON file into its geometries, entirely client-side (no
 * backend round trip). Accepts a bare Geometry, a Feature, or a FeatureCollection,
 * mirroring the shapes the backend's own GeoJSON upload parsers accept
 * (`backend/src/shadowbot/api/routes/geodata.py`).
 */
export async function parseGeometryFile<T extends Geometry = Geometry>(
  file: File,
  allowedTypes: GeoJsonGeometryTypes[],
): Promise<T[]> {
  const text = await file.text();

  let raw: Feature | FeatureCollection | Geometry;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON");
  }

  const features: (Feature | Geometry)[] = raw.type === "FeatureCollection" ? raw.features : [raw];

  const geometries = features
    .map((feature) => (feature.type === "Feature" ? feature.geometry : feature))
    .filter((geometry): geometry is T => allowedTypes.includes(geometry.type));

  if (geometries.length === 0) {
    throw new Error(`No ${allowedTypes.join("/")} geometry found in file`);
  }

  return geometries;
}
