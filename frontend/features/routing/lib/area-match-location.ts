import type { AreaMatch } from "@/features/routing/types";
import type { ChatLocation } from "@/features/map/types";

/** Flattens an AreaMatch's raw OSM identity into the string map ChatLocation carries. */
export function areaMatchProperties(area: AreaMatch): Record<string, string> {
  const properties: Record<string, string> = {};
  if (area.osmType) properties.osmType = area.osmType;
  if (area.osmId != null) properties.osmId = String(area.osmId);
  if (area.url) properties.url = area.url;
  for (const [key, value] of Object.entries(area.rawTags)) {
    properties[key] = value;
  }
  return properties;
}

/** Promotes a candidate area match into a full chat location — pinned, labelable, colored by category. */
export function chatLocationFromAreaMatch(area: AreaMatch): ChatLocation {
  return {
    id: crypto.randomUUID(),
    kind: area.category,
    label: area.name ?? area.category,
    geometry: area.geometry,
    properties: areaMatchProperties(area),
  };
}
