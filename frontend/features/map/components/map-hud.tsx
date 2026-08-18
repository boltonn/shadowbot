"use client";

import { useEffect, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

function formatCoordinate(value: number, positiveLabel: string, negativeLabel: string): string {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positiveLabel : negativeLabel}`;
}

export function MapHud() {
  const { map, isLoaded } = useMap();
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const isAgentBusy = useMapStore((state) => state.isAgentBusy);
  const agentBusyLabel = useMapStore((state) => state.agentBusyLabel);

  useEffect(() => {
    if (!map) return;

    const handleMouseMove = (e: MapMouseEvent) => {
      setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    const handleZoom = () => setZoom(map.getZoom());

    map.on("mousemove", handleMouseMove);
    map.on("zoom", handleZoom);
    setZoom(map.getZoom());

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("zoom", handleZoom);
    };
  }, [map]);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-sm border border-border bg-background/85 px-3 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur-sm">
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLoaded ? "animate-pulse bg-signal" : "bg-muted-foreground",
        )}
      />
      <span className="text-foreground">{isLoaded ? "LIVE" : "SYNC"}</span>
      <span className="text-border">/</span>
      <span>
        {cursor
          ? `${formatCoordinate(cursor.lat, "N", "S")} ${formatCoordinate(cursor.lng, "E", "W")}`
          : "--.----°  --.----°"}
      </span>
      <span className="text-border">/</span>
      <span>Z{zoom?.toFixed(1) ?? "-"}</span>
      {isAgentBusy && (
        <>
          <span className="text-border">/</span>
          <span className="flex items-center gap-1.5 text-signal">
            <span className="size-1.5 animate-pulse rounded-full bg-signal" />
            {agentBusyLabel ?? "Working…"}
          </span>
        </>
      )}
    </div>
  );
}
