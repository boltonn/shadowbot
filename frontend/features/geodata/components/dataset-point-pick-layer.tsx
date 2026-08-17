"use client";

import { useEffect } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";

/** While a point dataset is armed for "add point", captures the next map click as its geometry. */
export function DatasetPointPickLayer() {
  const { map } = useMap();
  const drawFeatureMode = useMapStore((state) => state.drawFeatureMode);
  const setPendingFeatureDraft = useMapStore((state) => state.setPendingFeatureDraft);

  useEffect(() => {
    if (!map || drawFeatureMode?.kind !== "point") return;
    map.getCanvas().style.cursor = "crosshair";

    const handleClick = (e: MapMouseEvent) => {
      setPendingFeatureDraft({
        datasetId: drawFeatureMode.datasetId,
        kind: "point",
        geometry: { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat] },
      });
    };

    map.on("click", handleClick);
    return () => {
      map.getCanvas().style.cursor = "";
      map.off("click", handleClick);
    };
  }, [map, drawFeatureMode, setPendingFeatureDraft]);

  return null;
}
