"use client";

import { useEffect } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useRoutePlannerStore } from "@/features/routing/planner-store";

/** While a route-planner field is armed to "pick on map", captures the next map click as its point. */
export function RoutePlannerPickLayer() {
  const { map } = useMap();
  const pickTarget = useRoutePlannerStore((state) => state.pickTarget);
  const setOrigin = useRoutePlannerStore((state) => state.setOrigin);
  const setDestination = useRoutePlannerStore((state) => state.setDestination);

  useEffect(() => {
    if (!map || !pickTarget) return;
    map.getCanvas().style.cursor = "crosshair";

    const handleClick = (e: MapMouseEvent) => {
      const value = {
        point: { type: "Point" as const, coordinates: [e.lngLat.lng, e.lngLat.lat] as [number, number] },
        label: `${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}`,
      };
      if (pickTarget === "origin") setOrigin(value);
      else setDestination(value);
    };

    map.on("click", handleClick);
    return () => {
      map.getCanvas().style.cursor = "";
      map.off("click", handleClick);
    };
  }, [map, pickTarget, setOrigin, setDestination]);

  return null;
}
