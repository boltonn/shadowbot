/**
 * A location the agent has explicitly chosen to plot via the update_map_locations tool.
 * `kind` is an icon category (see features/geodata/lib/category-icons.ts) — known values get
 * a dedicated icon, anything else (raw OSM "key=value" tags, etc.) falls back to a generic pin.
 */
export type ChatLocation = {
  id: string;
  kind: string;
  label: string;
  longitude: number;
  latitude: number;
  /** Raw element detail carried over from the source tool (osm_type/osm_id/url/address/raw_tags, etc.). */
  properties: Record<string, string>;
};

/** How a set of chat locations should change what's currently plotted on the map. */
export type ChatLocationAction = "add" | "replace" | "remove";

/** An inclusive [start, end] ISO datetime range. */
export type TimeWindow = [string, string];
