import {
  Banknote,
  BatteryCharging,
  Briefcase,
  Bus,
  Camera,
  Car,
  Coffee,
  CircleDot,
  Dumbbell,
  Fuel,
  History,
  Home,
  Hospital,
  Hotel,
  Landmark,
  MapPin,
  ParkingCircle,
  Pill,
  ScanFace,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Sofa,
  Store,
  Tent,
  TrainFront,
  Trees,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Telematics/surveillance dataset categories.
  vehicle: Car,
  face: ScanFace,
  phone: Smartphone,
  image: Camera,
  camera: Camera,
  toll: Landmark,
  // OSM-style POI categories, shared with chat/agent-plotted locations.
  hotel: Hotel,
  park: Trees,
  bus_stop: Bus,
  rail_station: TrainFront,
  police_station: ShieldAlert,
  military_base: Shield,
  cafe: Coffee,
  coffee: Coffee,
  shop: Store,
  gas_station: Fuel,
  ev_charging: BatteryCharging,
  supermarket: ShoppingCart,
  restaurant: Utensils,
  parking: ParkingCircle,
  rest_area: Sofa,
  pharmacy: Pill,
  hospital: Hospital,
  gym: Dumbbell,
  bank: Landmark,
  atm: Banknote,
  car_repair: Wrench,
  campground: Tent,
  // Chat-only kinds.
  geocode: MapPin,
  frequented: History,
  home: Home,
  work: Briefcase,
  custom: CircleDot,
};

/** Categories with a dedicated icon — offered as suggestions when uploading a point dataset. */
export const KNOWN_CATEGORIES = Object.keys(CATEGORY_ICONS);

/** Icon for a point category. Falls back to a generic pin for unrecognized categories. */
export function iconForCategory(category: string): LucideIcon {
  return CATEGORY_ICONS[category.toLowerCase()] ?? MapPin;
}

// Same 5 colors as the app's --chart-1..5 tokens (app/globals.css, dark theme) — the
// deterministic default before a user picks a custom color for a category.
const DEFAULT_CATEGORY_COLORS = ["#ffb020", "#4fd1c5", "#8a9099", "#e5484d", "#5b8def"];
export const FALLBACK_CATEGORY_COLOR = "#8a9099";

function defaultColorForCategory(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return DEFAULT_CATEGORY_COLORS[Math.abs(hash) % DEFAULT_CATEGORY_COLORS.length];
}

/**
 * Resolves a category to its display color: a user override if one's been set
 * (see category-color-store.ts), otherwise a deterministic default so every
 * category still gets a consistent color out of the box.
 */
export function colorForCategory(category: string, overrides: Record<string, string> = {}): string {
  return overrides[category.toLowerCase()] ?? defaultColorForCategory(category);
}

/** A MapLibre `match` expression coloring circle markers by their `category` property. */
export function categoryColorMatchExpression(categories: string[], overrides: Record<string, string> = {}) {
  const expression: unknown[] = ["match", ["get", "category"]];
  for (const category of categories) {
    expression.push(category, colorForCategory(category, overrides));
  }
  expression.push(FALLBACK_CATEGORY_COLOR);
  return expression;
}
