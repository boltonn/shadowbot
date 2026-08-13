"use client";

import { Download, Plus, X } from "lucide-react";
import { useMapStore } from "@/features/map/store";
import { ArrivalEstimatePanel } from "@/features/routing/components/arrival-estimate-panel";
import { useReroute } from "@/features/routing/hooks/use-reroute";
import { downloadRouteCsv, downloadRouteGpx } from "@/features/routing/lib/export";
import { formatDistance, formatDuration } from "@/features/routing/lib/format";
import { cn } from "@/lib/utils";

/** Floating panel surfacing the active route's distance/duration, stops, and any alternates to switch to. */
export function RouteSummary() {
  const activeRoute = useMapStore((state) => state.activeRoute);
  const selectAlternate = useMapStore((state) => state.selectAlternate);
  const addStopMode = useMapStore((state) => state.addStopMode);
  const setAddStopMode = useMapStore((state) => state.setAddStopMode);
  const { mutate: reroute, isPending: isRerouting } = useReroute();

  if (!activeRoute) return null;

  function removeWaypoint(index: number) {
    if (!activeRoute) return;
    reroute({
      routeId: activeRoute.id,
      body: {
        avoid: activeRoute.avoid,
        avoidPriorRoute: false,
        waypoints: activeRoute.waypoints.filter((_, i) => i !== index),
      },
    });
  }

  return (
    <div className="absolute top-3 right-3 z-10 flex w-56 flex-col gap-2 rounded-sm border border-border bg-background/85 px-3 py-2 backdrop-blur-sm">
      <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Route</span>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-medium text-foreground">{formatDistance(activeRoute.distanceM)}</span>
          <span className="text-xs text-muted-foreground">{formatDuration(activeRoute.durationS)}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => downloadRouteGpx(activeRoute)}
            className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="size-3" />
            GPX
          </button>
          <button
            type="button"
            onClick={() => downloadRouteCsv(activeRoute)}
            className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Download className="size-3" />
            CSV
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {activeRoute.waypoints.length} stop{activeRoute.waypoints.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setAddStopMode(!addStopMode)}
            disabled={isRerouting}
            className={cn(
              "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs",
              addStopMode
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              isRerouting && "opacity-50",
            )}
          >
            <Plus className="size-3" />
            {addStopMode ? "Click map..." : "Add stop"}
          </button>
        </div>
        {activeRoute.waypoints.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {activeRoute.waypoints.map((waypoint, index) => (
              <li key={index} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Stop {index + 1} · {waypoint.coordinates[1].toFixed(3)}, {waypoint.coordinates[0].toFixed(3)}
                </span>
                <button
                  type="button"
                  onClick={() => removeWaypoint(index)}
                  disabled={isRerouting}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`Remove stop ${index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {activeRoute.alternates.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {activeRoute.alternates.map((alternate) => (
            <li key={alternate.id}>
              <button
                type="button"
                onClick={() => selectAlternate(alternate.id)}
                className={cn(
                  "flex w-full items-baseline justify-between rounded-sm px-1.5 py-1 text-left text-xs",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span>{formatDistance(alternate.distanceM)}</span>
                <span>{formatDuration(alternate.durationS)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ArrivalEstimatePanel />
    </div>
  );
}
