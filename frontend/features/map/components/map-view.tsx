"use client";

import { Map } from "@/components/ui/map";
import { MapHud } from "@/features/map/components/map-hud";
import { MapLayers } from "@/features/map/components/map-layers";

const mapStyles = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT,
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_DARK,
};

export function MapView() {
  return (
    <Map
      className="h-full w-full"
      theme="dark"
      styles={mapStyles}
      center={[-77.4, 38.75]}
      zoom={9}
    >
      <MapLayers />
      <MapHud />
    </Map>
  );
}
