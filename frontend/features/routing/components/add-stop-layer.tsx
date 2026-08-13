"use client";

import { useEffect } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { useReroute } from "@/features/routing/hooks/use-reroute";

/** While add-stop mode is armed, appends the next map click as a waypoint on the active route. */
export function AddStopLayer() {
  const { map } = useMap();
  const activeRoute = useMapStore((state) => state.activeRoute);
  const addStopMode = useMapStore((state) => state.addStopMode);
  const setAddStopMode = useMapStore((state) => state.setAddStopMode);
  const { mutate: reroute } = useReroute();

  useEffect(() => {
    if (!map || !addStopMode || !activeRoute) return;

    map.getCanvas().style.cursor = "crosshair";

    const handleClick = (e: MapMouseEvent) => {
      setAddStopMode(false);
      reroute({
        routeId: activeRoute.id,
        body: {
          avoid: activeRoute.avoid,
          avoidPriorRoute: false,
          waypoints: [
            ...activeRoute.waypoints,
            { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat] },
          ],
        },
      });
    };

    map.on("click", handleClick);
    return () => {
      map.getCanvas().style.cursor = "";
      map.off("click", handleClick);
    };
  }, [map, addStopMode, activeRoute, setAddStopMode, reroute]);

  return null;
}
