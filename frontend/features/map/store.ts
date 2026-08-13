import { create } from "zustand";
import type { DrawMode, DrawnFeature } from "@/components/ui/map-draw";
import type { Route, RouteAlternate, RouteSearchMatch } from "@/features/routing/types";
import type { ChatLocation, TimeWindow } from "@/features/map/types";
import type { Polygon } from "geojson";

type MapState = {
  activeRoute: Route | null;
  matchedRoutes: RouteSearchMatch[];
  visibleDatasetIds: string[];
  chatLocations: ChatLocation[];
  trackTimeWindows: Record<string, TimeWindow>;
  filteredFeatureIds: Record<string, Set<string> | null>;
  areaSelectDrawMode: DrawMode | null;
  selectedArea: DrawnFeature<Polygon> | null;
  addStopMode: boolean;
  setActiveRoute: (route: Route | null) => void;
  selectAlternate: (alternateId: string) => void;
  setMatchedRoutes: (matches: RouteSearchMatch[]) => void;
  selectMatchedRoute: (routeId: string) => void;
  clearMatchedRoutes: () => void;
  toggleDatasetVisibility: (datasetId: string) => void;
  addChatLocations: (locations: ChatLocation[]) => void;
  clearChatLocations: () => void;
  setTrackTimeWindow: (trackId: string, window: TimeWindow) => void;
  clearTrackTimeWindow: (trackId: string) => void;
  setFilteredFeatureIds: (datasetId: string, ids: Set<string> | null) => void;
  setAreaSelectDrawMode: (mode: DrawMode | null) => void;
  setSelectedArea: (area: DrawnFeature<Polygon> | null) => void;
  setAddStopMode: (enabled: boolean) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activeRoute: null,
  matchedRoutes: [],
  visibleDatasetIds: [],
  chatLocations: [],
  trackTimeWindows: {},
  filteredFeatureIds: {},
  areaSelectDrawMode: null,
  selectedArea: null,
  addStopMode: false,
  setActiveRoute: (route) => set({ activeRoute: route }),
  setMatchedRoutes: (matches) => set({ matchedRoutes: matches }),
  selectMatchedRoute: (routeId) =>
    set((state) => {
      const chosen = state.matchedRoutes.find((match) => match.route.id === routeId);
      if (!chosen) return {};
      return { activeRoute: chosen.route, matchedRoutes: [] };
    }),
  clearMatchedRoutes: () => set({ matchedRoutes: [] }),
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
  setFilteredFeatureIds: (datasetId, ids) =>
    set((state) => ({
      filteredFeatureIds: { ...state.filteredFeatureIds, [datasetId]: ids },
    })),
  setAreaSelectDrawMode: (mode) => set({ areaSelectDrawMode: mode }),
  setSelectedArea: (area) => set({ selectedArea: area }),
  setAddStopMode: (enabled) => set({ addStopMode: enabled }),
}));
