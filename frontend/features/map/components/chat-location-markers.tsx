"use client";

import { useEffect } from "react";
import {
  BatteryCharging,
  Coffee,
  Fuel,
  History,
  Hospital,
  Hotel,
  MapPin,
  ParkingCircle,
  Pill,
  ShoppingCart,
  Sofa,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { MapMarker, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import type { ChatLocationKind } from "@/features/map/types";

const ICONS: Record<ChatLocationKind, LucideIcon> = {
  geocode: MapPin,
  frequented: History,
  gas_station: Fuel,
  ev_charging: BatteryCharging,
  supermarket: ShoppingCart,
  restaurant: Utensils,
  coffee: Coffee,
  parking: ParkingCircle,
  rest_area: Sofa,
  hotel: Hotel,
  pharmacy: Pill,
  hospital: Hospital,
};

export function ChatLocationMarkers() {
  const { map } = useMap();
  const chatLocations = useMapStore((state) => state.chatLocations);

  useEffect(() => {
    if (!map || chatLocations.length === 0) return;
    fitToCoordinates(
      map,
      chatLocations.map((location) => [location.longitude, location.latitude]),
    );
  }, [map, chatLocations]);

  return (
    <>
      {chatLocations.map((location) => {
        const Icon = ICONS[location.kind];
        return (
          <MapMarker key={location.id} longitude={location.longitude} latitude={location.latitude}>
            <MarkerContent>
              <Icon
                className="text-signal size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                strokeWidth={2.5}
              />
            </MarkerContent>
            <MarkerTooltip>{location.label}</MarkerTooltip>
          </MapMarker>
        );
      })}
    </>
  );
}
