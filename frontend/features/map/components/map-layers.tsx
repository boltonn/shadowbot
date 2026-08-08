"use client";

import { useEffect } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import { MapGeoJSON, MapRoute, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { circlePolygon } from "@/lib/geo";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { TrackLayer } from "@/features/geodata/components/track-layer";
import { PointDatasetLayer } from "@/features/geodata/components/point-dataset-layer";
import { PointDatasetLegend } from "@/features/geodata/components/point-dataset-legend";
import { ChatLocationMarkers } from "@/features/map/components/chat-location-markers";
import { AreaSelectLayer } from "@/features/map/components/area-select-layer";

const EXCLUDE_ZONE_RADIUS_M = 300;

function toFeatureCollection(polygons: Polygon[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: polygons.map((geometry) => ({ type: "Feature", geometry, properties: {} })),
  };
}

export function MapLayers() {
  const { map } = useMap();
  const activeRoute = useMapStore((state) => state.activeRoute);
  const excludePolygons = useMapStore((state) => state.excludePolygons);
  const isExcludeMode = useMapStore((state) => state.isExcludeMode);
  const addExcludePolygon = useMapStore((state) => state.addExcludePolygon);
  const visibleTrackIds = useMapStore((state) => state.visibleTrackIds);
  const visiblePointDatasetIds = useMapStore((state) => state.visiblePointDatasetIds);

  useEffect(() => {
    if (!map || !isExcludeMode) return;

    const handleClick = (e: MapMouseEvent) => {
      addExcludePolygon(
        circlePolygon([e.lngLat.lng, e.lngLat.lat], EXCLUDE_ZONE_RADIUS_M),
      );
    };

    map.getCanvas().style.cursor = "crosshair";
    map.on("click", handleClick);

    return () => {
      map.getCanvas().style.cursor = "";
      map.off("click", handleClick);
    };
  }, [map, isExcludeMode, addExcludePolygon]);

  useEffect(() => {
    if (!map || !activeRoute) return;
    fitToCoordinates(map, activeRoute.geometry.coordinates as [number, number][]);
  }, [map, activeRoute]);

  return (
    <>
      {excludePolygons.length > 0 && (
        <MapGeoJSON
          id="exclude-zones"
          data={toFeatureCollection(excludePolygons)}
          fillPaint={{ "fill-color": "#e5484d", "fill-opacity": 0.15 }}
          linePaint={{ "line-color": "#e5484d", "line-width": 1.5 }}
        />
      )}
      {activeRoute && (
        <MapRoute
          id="active-route"
          coordinates={activeRoute.geometry.coordinates as [number, number][]}
          color="#4fd1c5"
          width={4}
        />
      )}
      {visibleTrackIds.map((trackId) => (
        <TrackLayer key={trackId} trackId={trackId} />
      ))}
      {visiblePointDatasetIds.map((datasetId) => (
        <PointDatasetLayer key={datasetId} datasetId={datasetId} />
      ))}
      <PointDatasetLegend />
      <ChatLocationMarkers />
      <AreaSelectLayer />
    </>
  );
}
