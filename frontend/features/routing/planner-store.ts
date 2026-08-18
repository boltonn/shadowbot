import { create } from "zustand";
import type { Point } from "geojson";

export type RoutePlannerPoint = {
  point: Point;
  label: string;
  /** Raw OSM identity/address, when set from a geocode result — omitted for a map-clicked point. */
  properties?: Record<string, string>;
};
type PickTarget = "origin" | "destination" | null;

type RoutePlannerState = {
  origin: RoutePlannerPoint | null;
  destination: RoutePlannerPoint | null;
  pickTarget: PickTarget;
  setOrigin: (value: RoutePlannerPoint | null) => void;
  setDestination: (value: RoutePlannerPoint | null) => void;
  setPickTarget: (target: PickTarget) => void;
  reset: () => void;
};

export const useRoutePlannerStore = create<RoutePlannerState>((set) => ({
  origin: null,
  destination: null,
  pickTarget: null,
  setOrigin: (origin) => set({ origin, pickTarget: null }),
  setDestination: (destination) => set({ destination, pickTarget: null }),
  setPickTarget: (pickTarget) => set({ pickTarget }),
  reset: () => set({ origin: null, destination: null, pickTarget: null }),
}));
