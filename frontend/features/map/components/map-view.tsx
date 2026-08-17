"use client";

import { Map } from "@/components/ui/map";
import { MapHud } from "@/features/map/components/map-hud";
import { MapLayers } from "@/features/map/components/map-layers";
import { AddStopLayer } from "@/features/routing/components/add-stop-layer";
import { RoutePlannerPickLayer } from "@/features/routing/components/route-planner-pick-layer";
import { RouteSummary } from "@/features/routing/components/route-summary";
import { MAP_STYLE_OPTIONS, useMapStyleStore } from "@/features/map/style-store";

export function MapView() {
  const styleId = useMapStyleStore((state) => state.styleId);
  const style = MAP_STYLE_OPTIONS.find((option) => option.id === styleId) ?? MAP_STYLE_OPTIONS[0];

  return (
    <Map
      className="h-full w-full"
      theme="dark"
      styles={{ light: style.url, dark: style.url }}
      center={[-77.4, 38.75]}
      zoom={9}
    >
      <MapLayers />
      <MapHud />
      <RouteSummary />
      <AddStopLayer />
      <RoutePlannerPickLayer />
    </Map>
  );
}
