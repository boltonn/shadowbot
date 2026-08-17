import { create } from "zustand";
import type { Point, Polygon } from "geojson";
import type { DrawMode, DrawnFeature } from "@/components/ui/map-draw";
import type { Route, RouteAlternate, RouteSearchMatch } from "@/features/routing/types";
import type { ChatLocation, ChatLocationAction, TimeWindow } from "@/features/map/types";
import type { DatasetGeometryKind } from "@/features/geodata/types";

/** Identifies a single feature in a dataset — the shared selection driving map/table sync. */
export type SelectedFeature = { datasetId: string; featureId: string };

/** Arms map interaction to capture a new feature's geometry for a given dataset. */
export type DrawFeatureMode = { datasetId: string; kind: Extract<DatasetGeometryKind, "point" | "polygon"> };

/** A captured geometry awaiting category/name/tags before it's posted as a new feature. */
export type PendingFeatureDraft = {
  datasetId: string;
  kind: Extract<DatasetGeometryKind, "point" | "polygon">;
  geometry: Point | Polygon;
};

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
  selectedFeature: SelectedFeature | null;
  drawFeatureMode: DrawFeatureMode | null;
  pendingFeatureDraft: PendingFeatureDraft | null;
  selectedChatLocationId: string | null;
  /** Bumped to re-fit the map to the active route on demand, even if the route itself didn't change. */
  routeFocusToken: number;
  setActiveRoute: (route: Route | null) => void;
  selectAlternate: (alternateId: string) => void;
  setMatchedRoutes: (matches: RouteSearchMatch[]) => void;
  selectMatchedRoute: (routeId: string) => void;
  clearMatchedRoutes: () => void;
  toggleDatasetVisibility: (datasetId: string) => void;
  applyChatLocationsUpdate: (action: ChatLocationAction, locations: ChatLocation[], removeIds: string[]) => void;
  renameChatLocation: (id: string, label: string) => void;
  setTrackTimeWindow: (trackId: string, window: TimeWindow) => void;
  clearTrackTimeWindow: (trackId: string) => void;
  setFilteredFeatureIds: (datasetId: string, ids: Set<string> | null) => void;
  setAreaSelectDrawMode: (mode: DrawMode | null) => void;
  setSelectedArea: (area: DrawnFeature<Polygon> | null) => void;
  setAddStopMode: (enabled: boolean) => void;
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  setDrawFeatureMode: (mode: DrawFeatureMode | null) => void;
  setPendingFeatureDraft: (draft: PendingFeatureDraft | null) => void;
  setSelectedChatLocationId: (id: string | null) => void;
  focusActiveRoute: () => void;
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
  selectedFeature: null,
  drawFeatureMode: null,
  pendingFeatureDraft: null,
  selectedChatLocationId: null,
  routeFocusToken: 0,
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
  applyChatLocationsUpdate: (action, locations, removeIds) =>
    set((state) => {
      if (action === "replace") return { chatLocations: locations };
      if (action === "remove") {
        const dropIds = new Set(removeIds);
        return { chatLocations: state.chatLocations.filter((location) => !dropIds.has(location.id)) };
      }
      return { chatLocations: [...state.chatLocations, ...locations] };
    }),
  renameChatLocation: (id, label) =>
    set((state) => ({
      chatLocations: state.chatLocations.map((location) => (location.id === id ? { ...location, label } : location)),
    })),
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
  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
  setDrawFeatureMode: (mode) => set({ drawFeatureMode: mode }),
  setPendingFeatureDraft: (draft) => set({ pendingFeatureDraft: draft }),
  setSelectedChatLocationId: (id) => set({ selectedChatLocationId: id }),
  focusActiveRoute: () => set((state) => ({ routeFocusToken: state.routeFocusToken + 1 })),
}));
