"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MapMarker, MapPopup, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { colorForCategory, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { cn } from "@/lib/utils";

/** The raw element detail behind a chat-plotted location — every OSM field the agent carried over. */
function RawProperties({ properties }: { properties: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { url, ...rest } = properties;
  const keys = Object.keys(rest);
  if (!url && keys.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-signal underline underline-offset-2"
        >
          View raw OSM element
        </a>
      )}
      {keys.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
            Raw data ({keys.length})
          </button>
          {open && (
            <dl className="grid max-h-40 grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 overflow-auto rounded-sm border border-border bg-muted/20 p-1.5 text-[10px]">
              {keys.map((key) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-muted-foreground">{key}</dt>
                  <dd className="truncate">{rest[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

export function ChatLocationMarkers() {
  const { map } = useMap();
  const chatLocations = useMapStore((state) => state.chatLocations);
  const selectedChatLocationId = useMapStore((state) => state.selectedChatLocationId);
  const setSelectedChatLocationId = useMapStore((state) => state.setSelectedChatLocationId);
  const overrides = useCategoryColorStore((state) => state.overrides);
  const openLocation = chatLocations.find((location) => location.id === selectedChatLocationId) ?? null;

  useEffect(() => {
    if (!map || chatLocations.length === 0) return;
    fitToCoordinates(
      map,
      chatLocations.map((location) => [location.longitude, location.latitude]),
    );
  }, [map, chatLocations]);

  // Selecting a location from the data view (map not necessarily in frame) should still bring
  // it into view — center without touching zoom, gentle enough for a direct marker click too.
  useEffect(() => {
    if (!map || !openLocation) return;
    map.easeTo({ center: [openLocation.longitude, openLocation.latitude], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, openLocation?.longitude, openLocation?.latitude]);

  return (
    <>
      {chatLocations.map((location) => {
        const Icon = iconForCategory(location.kind);
        return (
          <MapMarker
            key={location.id}
            longitude={location.longitude}
            latitude={location.latitude}
            onClick={() => setSelectedChatLocationId(location.id)}
          >
            <MarkerContent>
              <Icon
                className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                style={{ color: colorForCategory(location.kind, overrides) }}
                strokeWidth={2.5}
              />
            </MarkerContent>
            <MarkerTooltip>{location.label}</MarkerTooltip>
          </MapMarker>
        );
      })}
      {openLocation && (
        <MapPopup
          longitude={openLocation.longitude}
          latitude={openLocation.latitude}
          onClose={() => setSelectedChatLocationId(null)}
          closeButton
        >
          <div className="w-56">
            <p className="text-sm font-medium">{openLocation.label}</p>
            <p className="text-xs text-muted-foreground capitalize">{openLocation.kind.replace(/_/g, " ")}</p>
            <RawProperties properties={openLocation.properties} />
          </div>
        </MapPopup>
      )}
    </>
  );
}
