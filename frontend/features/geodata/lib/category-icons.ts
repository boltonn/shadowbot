import { Camera, Car, Landmark, MapPin, ScanFace, Smartphone, type LucideIcon } from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  vehicle: Car,
  face: ScanFace,
  phone: Smartphone,
  image: Camera,
  camera: Camera,
  toll: Landmark,
};

/** Icon for a point category. Falls back to a generic pin for unrecognized categories. */
export function iconForCategory(category: string): LucideIcon {
  return CATEGORY_ICONS[category.toLowerCase()] ?? MapPin;
}

// Same 5 colors as the app's --chart-1..5 tokens (app/globals.css, dark theme).
const CATEGORY_COLOR_CLASSES = [
  "text-chart-1",
  "text-chart-2",
  "text-chart-3",
  "text-chart-4",
  "text-chart-5",
];
const CATEGORY_COLOR_HEX = ["#ffb020", "#4fd1c5", "#8a9099", "#e5484d", "#5b8def"];

function categoryColorIndex(category: string): number {
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CATEGORY_COLOR_CLASSES.length;
}

/** Deterministically maps a category string to one of the app's 5 chart colors, as a Tailwind class. */
export function colorForCategory(category: string): string {
  return CATEGORY_COLOR_CLASSES[categoryColorIndex(category)];
}

/** Same mapping as `colorForCategory`, as a raw hex value for MapLibre paint expressions. */
export function hexColorForCategory(category: string): string {
  return CATEGORY_COLOR_HEX[categoryColorIndex(category)];
}

/** A MapLibre `match` expression coloring circle markers by their `category` property. */
export function categoryColorMatchExpression(categories: string[]) {
  const expression: unknown[] = ["match", ["get", "category"]];
  for (const category of categories) {
    expression.push(category, hexColorForCategory(category));
  }
  expression.push("#8a9099");
  return expression;
}
