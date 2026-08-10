/**
 * Known kinds get a dedicated icon (see chat-location-markers.tsx). The `string & {}`
 * member keeps literal autocomplete for those while still accepting anything else —
 * POI search can return arbitrary "key=value" OSM tags beyond the curated list.
 */
export type ChatLocationKind =
  | "geocode"
  | "frequented"
  | "gas_station"
  | "ev_charging"
  | "supermarket"
  | "restaurant"
  | "coffee"
  | "parking"
  | "rest_area"
  | "hotel"
  | "pharmacy"
  | "hospital"
  | "park"
  | "bank"
  | "atm"
  | "car_repair"
  | "campground"
  | "custom"
  | (string & {});

/** A location surfaced by a chat tool call (geocode, POI search, frequented locations). */
export type ChatLocation = {
  id: string;
  kind: ChatLocationKind;
  label: string;
  longitude: number;
  latitude: number;
};

/** An inclusive [start, end] ISO datetime range. */
export type TimeWindow = [string, string];
