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
  | "hospital";

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
