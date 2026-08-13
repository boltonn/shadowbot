import type { ChatLocation, ChatLocationKind } from "@/features/map/types";

const LOCATION_TOOL_NAMES = new Set([
  "geocode",
  "find_nearby_poi",
  "find_poi_along_route",
  "find_frequented_locations",
  "find_point_dataset_along_route",
  "save_location_label",
]);

export function isLocationTool(toolName: string): boolean {
  return LOCATION_TOOL_NAMES.has(toolName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pointCoordinates(geometry: unknown): [number, number] | null {
  if (!isRecord(geometry)) return null;
  const coordinates = geometry.coordinates;
  if (
    !Array.isArray(coordinates) ||
    typeof coordinates[0] !== "number" ||
    typeof coordinates[1] !== "number"
  ) {
    return null;
  }
  return [coordinates[0], coordinates[1]];
}

function toGeocodeLocation(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  return {
    id,
    kind: "geocode",
    label: typeof item.displayName === "string" ? item.displayName : "Location",
    longitude: coords[0],
    latitude: coords[1],
  };
}

function toPoiLocation(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  const kind: ChatLocationKind = typeof item.category === "string" ? (item.category as ChatLocationKind) : "geocode";
  // Raw OSM tags come through as "key=value" (e.g. "leisure=park") — use the value for the label.
  const fallbackLabel = kind.includes("=") ? kind.split("=")[1] : kind;
  return {
    id,
    kind,
    label: typeof item.name === "string" && item.name ? item.name : fallbackLabel.replace(/_/g, " "),
    longitude: coords[0],
    latitude: coords[1],
  };
}

function toFrequentedLocation(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  const category = typeof item.category === "string" ? item.category : "unknown";
  const visitCount = typeof item.visitCount === "number" ? item.visitCount : null;
  const name = typeof item.name === "string" && item.name ? item.name : null;
  const baseLabel = name ?? (category === "unknown" ? "Frequented location" : category.replace(/_/g, " "));
  return {
    id,
    kind: category === "unknown" ? "frequented" : category,
    label: visitCount ? `${baseLabel} · Visited ${visitCount}x` : baseLabel,
    longitude: coords[0],
    latitude: coords[1],
  };
}

function toDatasetFeatureLocation(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  const category = typeof item.category === "string" ? item.category : "point";
  const label = typeof item.name === "string" && item.name ? item.name : category.replace(/_/g, " ");
  return { id, kind: "custom", label, longitude: coords[0], latitude: coords[1] };
}

function toLocationLabel(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  const category = typeof item.category === "string" ? item.category : "custom";
  const label = typeof item.name === "string" && item.name ? item.name : category.replace(/_/g, " ");
  return { id, kind: category, label, longitude: coords[0], latitude: coords[1] };
}

/** Turns a finished location tool call's output into map-plottable locations. */
export function extractChatLocations(toolName: string, toolCallId: string, output: unknown): ChatLocation[] {
  const toLocation = {
    geocode: toGeocodeLocation,
    find_nearby_poi: toPoiLocation,
    find_poi_along_route: toPoiLocation,
    find_frequented_locations: toFrequentedLocation,
    find_point_dataset_along_route: toDatasetFeatureLocation,
    save_location_label: toLocationLabel,
  }[toolName];
  if (!toLocation) return [];

  // Most location tools return a list; save_location_label returns the single saved label.
  const items = Array.isArray(output) ? output : [output];
  return items
    .map((item, index) => toLocation(item, `${toolCallId}-${index}`))
    .filter((location): location is ChatLocation => location !== null);
}
