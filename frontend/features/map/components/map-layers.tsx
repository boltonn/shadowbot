"use client";

import { Suspense, useEffect } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { MapRoute, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { TrackLayer } from "@/features/geodata/components/track-layer";
import { PointDatasetLayer } from "@/features/geodata/components/point-dataset-layer";
import { PolygonDatasetLayer } from "@/features/geodata/components/polygon-dataset-layer";
import { PointDatasetLegend } from "@/features/geodata/components/point-dataset-legend";
import { FeatureInspector } from "@/features/geodata/components/feature-inspector";
import { DatasetPointPickLayer } from "@/features/geodata/components/dataset-point-pick-layer";
import { CreateFeatureDialog } from "@/features/geodata/components/create-feature-dialog";
import { ChatLocationMarkers } from "@/features/map/components/chat-location-markers";
import { AreaSelectLayer } from "@/features/map/components/area-select-layer";

export function MapLayers() {
  const { map } = useMap();
  const activeRoute = useMapStore((state) => state.activeRoute);
  const selectAlternate = useMapStore((state) => state.selectAlternate);
  const matchedRoutes = useMapStore((state) => state.matchedRoutes);
  const selectMatchedRoute = useMapStore((state) => state.selectMatchedRoute);
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);
  const routeFocusToken = useMapStore((state) => state.routeFocusToken);

  useEffect(() => {
    if (!map || !activeRoute) return;
    fitToCoordinates(map, activeRoute.geometry.coordinates as [number, number][]);
    // routeFocusToken has no meaningful value of its own — bumping it (e.g. from the data
    // view's "focus" button) just needs to re-run this same fit on demand.
  }, [map, activeRoute, routeFocusToken]);

  useEffect(() => {
    if (!map || matchedRoutes.length === 0) return;
    fitToCoordinates(map, matchedRoutes.flatMap((match) => match.route.geometry.coordinates as [number, number][]));
  }, [map, matchedRoutes]);

  return (
    <>
      <AreaSelectLayer />
      {matchedRoutes.map((match) => (
        <MapRoute
          key={match.route.id}
          id={`route-match-${match.route.id}`}
          coordinates={match.route.geometry.coordinates as [number, number][]}
          color="#f6ad55"
          width={4}
          opacity={0.7}
          onClick={() => selectMatchedRoute(match.route.id)}
        />
      ))}
      {activeRoute?.alternates.map((alternate) => (
        <MapRoute
          key={alternate.id}
          id={`route-alt-${alternate.id}`}
          coordinates={alternate.geometry.coordinates as [number, number][]}
          color="#4fd1c5"
          width={3}
          opacity={0.35}
          onClick={() => selectAlternate(alternate.id)}
        />
      ))}
      {activeRoute && (
        <MapRoute
          id="active-route"
          coordinates={activeRoute.geometry.coordinates as [number, number][]}
          color="#4fd1c5"
          width={4}
        />
      )}
      {visibleDatasetIds.map((datasetId) => (
        // Each layer fetches the same cached dataset detail and renders itself only
        // if its geometry kind matches — avoids needing to know the kind up front.
        <ErrorBoundary key={datasetId} fallback={null}>
          <Suspense fallback={null}>
            <TrackLayer trackId={datasetId} />
            <PointDatasetLayer datasetId={datasetId} />
            <PolygonDatasetLayer datasetId={datasetId} />
          </Suspense>
        </ErrorBoundary>
      ))}
      <PointDatasetLegend />
      <ChatLocationMarkers />
      <FeatureInspector />
      <DatasetPointPickLayer />
      <CreateFeatureDialog />
    </>
  );
}
