import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MapStyleOption = {
  id: string;
  label: string;
  url: string;
};

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: "openfreemap-liberty",
    label: "OpenFreeMap Liberty (3D buildings)",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "openfreemap-dark",
    label: "OpenFreeMap Dark",
    url: process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? "https://tiles.openfreemap.org/styles/dark",
  },
  {
    id: "openfreemap-bright",
    label: "OpenFreeMap Bright",
    url: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ?? "https://tiles.openfreemap.org/styles/bright",
  },
  {
    id: "carto-dark-matter",
    label: "Carto Dark Matter",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  {
    id: "carto-positron",
    label: "Carto Positron",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
];

type MapStyleState = {
  styleId: string;
  setStyleId: (styleId: string) => void;
};

export const useMapStyleStore = create<MapStyleState>()(
  persist(
    (set) => ({
      styleId: MAP_STYLE_OPTIONS[0].id,
      setStyleId: (styleId) => set({ styleId }),
    }),
    { name: "shadowbot:map-style" },
  ),
);
