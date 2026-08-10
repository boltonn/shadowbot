"use client";

import { Fragment, useEffect } from "react";
import { MapRoute, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { TrackLayer } from "@/features/geodata/components/track-layer";
import { PointDatasetLayer } from "@/features/geodata/components/point-dataset-layer";
import { PolygonDatasetLayer } from "@/features/geodata/components/polygon-dataset-layer";
import { PointDatasetLegend } from "@/features/geodata/components/point-dataset-legend";
import { ChatLocationMarkers } from "@/features/map/components/chat-location-markers";
import { AreaSelectLayer } from "@/features/map/components/area-select-layer";

export function MapLayers() {
  const { map } = useMap();
  const activeRoute = useMapStore((state) => state.activeRoute);
  const selectAlternate = useMapStore((state) => state.selectAlternate);
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);

  useEffect(() => {
    if (!map || !activeRoute) return;
    fitToCoordinates(map, activeRoute.geometry.coordinates as [number, number][]);
  }, [map, activeRoute]);

  return (
    <>
      <AreaSelectLayer />
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
        <Fragment key={datasetId}>
          <TrackLayer trackId={datasetId} />
          <PointDatasetLayer datasetId={datasetId} />
          <PolygonDatasetLayer datasetId={datasetId} />
        </Fragment>
      ))}
      <PointDatasetLegend />
      <ChatLocationMarkers />
    </>
  );
}
