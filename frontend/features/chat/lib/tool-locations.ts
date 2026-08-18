import type { Point, Polygon } from "geojson";
import type { ChatLocation, ChatLocationAction } from "@/features/map/types";

const UPDATE_MAP_LOCATIONS_TOOL = "update_map_locations";

export function isMapLocationsUpdateTool(toolName: string): boolean {
  return toolName === UPDATE_MAP_LOCATIONS_TOOL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

/** Validates a Point or Polygon geometry (the only two shapes update_map_locations sends). */
function toGeometry(geometry: unknown): Point | Polygon | null {
  if (!isRecord(geometry) || typeof geometry.type !== "string") return null;
  if (geometry.type === "Point" && isPosition(geometry.coordinates)) {
    return geometry as unknown as Point;
  }
  if (
    geometry.type === "Polygon" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.every((ring) => Array.isArray(ring) && ring.every(isPosition))
  ) {
    return geometry as unknown as Polygon;
  }
  return null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, val]) => [key, val]),
  );
}

function toChatLocation(item: unknown): ChatLocation | null {
  if (!isRecord(item)) return null;
  const geometry = toGeometry(item.geometry);
  if (!geometry) return null;
  if (typeof item.id !== "string" || typeof item.kind !== "string" || typeof item.label !== "string") return null;
  return {
    id: item.id,
    kind: item.kind,
    label: item.label,
    geometry,
    properties: stringRecord(item.properties),
  };
}

const ACTIONS = new Set<ChatLocationAction>(["add", "replace", "remove"]);

export type MapLocationsUpdate = { action: ChatLocationAction; locations: ChatLocation[]; removeIds: string[] };

/** Turns a finished update_map_locations tool call's output into a store-ready update. */
export function extractMapLocationsUpdate(toolName: string, output: unknown): MapLocationsUpdate | null {
  if (!isMapLocationsUpdateTool(toolName) || !isRecord(output)) return null;
  const action = output.action;
  if (typeof action !== "string" || !ACTIONS.has(action as ChatLocationAction)) return null;

  const locations = Array.isArray(output.locations)
    ? output.locations.map(toChatLocation).filter((location): location is ChatLocation => location !== null)
    : [];
  const removeIds = Array.isArray(output.removeIds)
    ? output.removeIds.filter((id): id is string => typeof id === "string")
    : [];

  return { action: action as ChatLocationAction, locations, removeIds };
}
