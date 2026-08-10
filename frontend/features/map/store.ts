import { create } from "zustand";
import type { DrawMode, DrawnFeature } from "@/components/ui/map-draw";
import type { Route, RouteAlternate } from "@/features/routing/types";
import type { ChatLocation, TimeWindow } from "@/features/map/types";
import type { Polygon } from "geojson";

type MapState = {
  activeRoute: Route | null;
  visibleDatasetIds: string[];
  chatLocations: ChatLocation[];
  trackTimeWindows: Record<string, TimeWindow>;
  areaSelectDrawMode: DrawMode | null;
  selectedArea: DrawnFeature<Polygon> | null;
  setActiveRoute: (route: Route | null) => void;
  selectAlternate: (alternateId: string) => void;
  toggleDatasetVisibility: (datasetId: string) => void;
  addChatLocations: (locations: ChatLocation[]) => void;
  clearChatLocations: () => void;
  setTrackTimeWindow: (trackId: string, window: TimeWindow) => void;
  clearTrackTimeWindow: (trackId: string) => void;
  setAreaSelectDrawMode: (mode: DrawMode | null) => void;
  setSelectedArea: (area: DrawnFeature<Polygon> | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activeRoute: null,
  visibleDatasetIds: [],
  chatLocations: [],
  trackTimeWindows: {},
  areaSelectDrawMode: null,
  selectedArea: null,
  setActiveRoute: (route) => set({ activeRoute: route }),
  selectAlternate: (alternateId) =>
    set((state) => {
      const current = state.activeRoute;
      const chosen = current?.alternates.find((alternate) => alternate.id === alternateId);
      if (!current || !chosen) return {};
      const demoted: RouteAlternate = {
        id: current.id,
        geometry: current.geometry,
        distanceM: current.distanceM,
        durationS: current.durationS,
      };
      return {
        activeRoute: {
          ...current,
          id: chosen.id,
          geometry: chosen.geometry,
          distanceM: chosen.distanceM,
          durationS: chosen.durationS,
          alternates: [demoted, ...current.alternates.filter((alternate) => alternate.id !== alternateId)],
        },
      };
    }),
  toggleDatasetVisibility: (datasetId) =>
    set((state) => ({
      visibleDatasetIds: state.visibleDatasetIds.includes(datasetId)
        ? state.visibleDatasetIds.filter((id) => id !== datasetId)
        : [...state.visibleDatasetIds, datasetId],
    })),
  addChatLocations: (locations) =>
    set((state) => ({ chatLocations: [...state.chatLocations, ...locations] })),
  clearChatLocations: () => set({ chatLocations: [] }),
  setTrackTimeWindow: (trackId, window) =>
    set((state) => ({
      trackTimeWindows: { ...state.trackTimeWindows, [trackId]: window },
    })),
  clearTrackTimeWindow: (trackId) =>
    set((state) => ({
      trackTimeWindows: Object.fromEntries(
        Object.entries(state.trackTimeWindows).filter(([id]) => id !== trackId),
      ),
    })),
  setAreaSelectDrawMode: (mode) => set({ areaSelectDrawMode: mode }),
  setSelectedArea: (area) => set({ selectedArea: area }),
}));
