import type { Polygon } from "geojson";
import { create } from "zustand";
import type { Route } from "@/features/routing/types";
import type { ChatLocation, TimeWindow } from "@/features/map/types";

type MapState = {
  activeRoute: Route | null;
  excludePolygons: Polygon[];
  isExcludeMode: boolean;
  visibleTrackIds: string[];
  visiblePointDatasetIds: string[];
  chatLocations: ChatLocation[];
  trackTimeWindows: Record<string, TimeWindow>;
  isAreaSelectMode: boolean;
  selectedArea: Polygon | null;
  setActiveRoute: (route: Route | null) => void;
  addExcludePolygon: (polygon: Polygon) => void;
  clearExcludePolygons: () => void;
  setExcludeMode: (isExcludeMode: boolean) => void;
  toggleTrackVisibility: (trackId: string) => void;
  togglePointDatasetVisibility: (datasetId: string) => void;
  addChatLocations: (locations: ChatLocation[]) => void;
  clearChatLocations: () => void;
  setTrackTimeWindow: (trackId: string, window: TimeWindow) => void;
  clearTrackTimeWindow: (trackId: string) => void;
  setAreaSelectMode: (isAreaSelectMode: boolean) => void;
  setSelectedArea: (polygon: Polygon | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activeRoute: null,
  excludePolygons: [],
  isExcludeMode: false,
  visibleTrackIds: [],
  visiblePointDatasetIds: [],
  chatLocations: [],
  trackTimeWindows: {},
  isAreaSelectMode: false,
  selectedArea: null,
  setActiveRoute: (route) => set({ activeRoute: route }),
  addExcludePolygon: (polygon) =>
    set((state) => ({
      excludePolygons: [...state.excludePolygons, polygon],
      isExcludeMode: false,
    })),
  clearExcludePolygons: () => set({ excludePolygons: [] }),
  setExcludeMode: (isExcludeMode) => set({ isExcludeMode }),
  toggleTrackVisibility: (trackId) =>
    set((state) => ({
      visibleTrackIds: state.visibleTrackIds.includes(trackId)
        ? state.visibleTrackIds.filter((id) => id !== trackId)
        : [...state.visibleTrackIds, trackId],
    })),
  togglePointDatasetVisibility: (datasetId) =>
    set((state) => ({
      visiblePointDatasetIds: state.visiblePointDatasetIds.includes(datasetId)
        ? state.visiblePointDatasetIds.filter((id) => id !== datasetId)
        : [...state.visiblePointDatasetIds, datasetId],
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
  setAreaSelectMode: (isAreaSelectMode) => set({ isAreaSelectMode }),
  setSelectedArea: (polygon) => set({ selectedArea: polygon }),
}));
