"use client";

import { useEffect } from "react";
import { MapMarker, MapPopup, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { centroidOf } from "@/features/map/lib/geometry";
import { colorForLocation, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { RawPropertiesDisclosure } from "@/features/map/components/raw-properties-disclosure";

export function ChatLocationMarkers() {
  const { map } = useMap();
  const chatLocations = useMapStore((state) => state.chatLocations);
  const selectedChatLocationId = useMapStore((state) => state.selectedChatLocationId);
  const setSelectedChatLocationId = useMapStore((state) => state.setSelectedChatLocationId);
  const overrides = useCategoryColorStore((state) => state.overrides);
  const locationOverrides = useCategoryColorStore((state) => state.locationOverrides);
  const pointLocations = chatLocations.filter((location) => location.geometry.type === "Point");
  const openLocation = chatLocations.find((location) => location.id === selectedChatLocationId) ?? null;
  const openCentroid = openLocation ? centroidOf(openLocation.geometry) : null;

  // Fit to every plotted location — points and polygons alike — even though polygons render
  // via the sibling ChatLocationPolygons component, so they still participate in framing.
  useEffect(() => {
    if (!map || chatLocations.length === 0) return;
    fitToCoordinates(map, chatLocations.map((location) => centroidOf(location.geometry)));
  }, [map, chatLocations]);

  // Selecting a location from the data view (map not necessarily in frame) should still bring
  // it into view — center without touching zoom, gentle enough for a direct marker/polygon click.
  useEffect(() => {
    if (!map || !openCentroid) return;
    map.easeTo({ center: openCentroid, duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, openCentroid?.[0], openCentroid?.[1]]);

  return (
    <>
      {pointLocations.map((location) => {
        const Icon = iconForCategory(location.kind);
        const [longitude, latitude] = centroidOf(location.geometry);
        return (
          <MapMarker
            key={location.id}
            longitude={longitude}
            latitude={latitude}
            onClick={() => setSelectedChatLocationId(location.id)}
          >
            <MarkerContent>
              <Icon
                className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                style={{ color: colorForLocation(location.id, location.kind, overrides, locationOverrides) }}
                strokeWidth={2.5}
              />
            </MarkerContent>
            <MarkerTooltip>{location.label}</MarkerTooltip>
          </MapMarker>
        );
      })}
      {openLocation && openCentroid && (
        <MapPopup
          longitude={openCentroid[0]}
          latitude={openCentroid[1]}
          onClose={() => setSelectedChatLocationId(null)}
          closeButton
        >
          <div className="w-56">
            <p className="text-sm font-medium">{openLocation.label}</p>
            <p className="text-xs text-muted-foreground capitalize">{openLocation.kind.replace(/_/g, " ")}</p>
            <RawPropertiesDisclosure properties={openLocation.properties} />
          </div>
        </MapPopup>
      )}
    </>
  );
}
