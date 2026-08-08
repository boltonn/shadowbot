import type { ChatLocation, ChatLocationKind } from "@/features/map/types";

const LOCATION_TOOL_NAMES = new Set([
  "geocode",
  "find_nearby_poi",
  "find_poi_along_route",
  "find_frequented_locations",
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
  return {
    id,
    kind,
    label: typeof item.name === "string" && item.name ? item.name : kind.replace(/_/g, " "),
    longitude: coords[0],
    latitude: coords[1],
  };
}

function toFrequentedLocation(item: unknown, id: string): ChatLocation | null {
  if (!isRecord(item)) return null;
  const coords = pointCoordinates(item.geometry);
  if (!coords) return null;
  const visitCount = typeof item.visitCount === "number" ? item.visitCount : null;
  return {
    id,
    kind: "frequented",
    label: visitCount ? `Visited ${visitCount}x` : "Frequented location",
    longitude: coords[0],
    latitude: coords[1],
  };
}

/** Turns a finished location tool call's output into map-plottable locations. */
export function extractChatLocations(toolName: string, toolCallId: string, output: unknown): ChatLocation[] {
  if (!Array.isArray(output)) return [];

  const toLocation = {
    geocode: toGeocodeLocation,
    find_nearby_poi: toPoiLocation,
    find_poi_along_route: toPoiLocation,
    find_frequented_locations: toFrequentedLocation,
  }[toolName];
  if (!toLocation) return [];

  return output
    .map((item, index) => toLocation(item, `${toolCallId}-${index}`))
    .filter((location): location is ChatLocation => location !== null);
}
