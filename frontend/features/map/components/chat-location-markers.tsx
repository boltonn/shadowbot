"use client";

import { useEffect } from "react";
import {
  Banknote,
  BatteryCharging,
  Briefcase,
  CircleDot,
  Coffee,
  Fuel,
  History,
  Home,
  Hospital,
  Hotel,
  Landmark,
  MapPin,
  ParkingCircle,
  Pill,
  ShoppingCart,
  Sofa,
  Tent,
  Trees,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { MapMarker, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import type { ChatLocationKind } from "@/features/map/types";

// Only the curated ChatLocationKind values get a dedicated icon. Anything else
// (raw OSM "key=value" tags from POI search) falls back to the "custom" pin below.
const ICONS: Partial<Record<ChatLocationKind, LucideIcon>> = {
  geocode: MapPin,
  frequented: History,
  home: Home,
  work: Briefcase,
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
  park: Trees,
  bank: Landmark,
  atm: Banknote,
  car_repair: Wrench,
  campground: Tent,
  custom: CircleDot,
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
        const Icon = ICONS[location.kind] ?? CircleDot;
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
