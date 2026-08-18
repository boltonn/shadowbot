import type { GeocodeResult } from "@/features/location/types";

/** Flattens a geocode result's raw OSM identity/address into the string map ChatLocation carries. */
export function geocodeResultProperties(result: GeocodeResult): Record<string, string> {
  const properties: Record<string, string> = {};
  if (result.osmType) properties.osmType = result.osmType;
  if (result.osmId) properties.osmId = String(result.osmId);
  if (result.osmClass) properties.osmClass = result.osmClass;
  if (result.placeType) properties.placeType = result.placeType;
  for (const [key, value] of Object.entries(result.address)) {
    properties[`address:${key}`] = value;
  }
  return properties;
}
