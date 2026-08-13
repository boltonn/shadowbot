"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMapStore } from "@/features/map/store";
import { useEstimateArrival } from "@/features/routing/hooks/use-estimate-arrival";
import { formatDuration } from "@/features/routing/lib/format";
import { cn } from "@/lib/utils";

function toLocalInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Lets the user pick a departure time and see a congestion-adjusted arrival estimate for the active route. */
export function ArrivalEstimatePanel() {
  const activeRoute = useMapStore((state) => state.activeRoute);
  const [departure, setDeparture] = useState(() => toLocalInputValue(new Date()));
  const { mutate, data: estimate, isPending, error } = useEstimateArrival();

  if (!activeRoute) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-2">
      <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Arrival</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="datetime-local"
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
          className="h-7 text-xs"
        />
        <button
          type="button"
          onClick={() => mutate({ routeId: activeRoute.id, body: { dateDeparture: new Date(departure).toISOString() } })}
          disabled={isPending}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
            isPending && "opacity-50",
          )}
        >
          <Clock className="size-3" />
        </button>
      </div>
      {error && <span className="text-xs text-destructive">Couldn&apos;t estimate arrival.</span>}
      {estimate && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-2 text-xs">
          <span className="text-foreground">
            Arrive {new Date(estimate.dateArrival).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          <span className="text-muted-foreground">
            {formatDuration(estimate.estimatedDurationS)} est. ({formatDuration(estimate.freeFlowDurationS)} free-flow)
          </span>
        </div>
      )}
    </div>
  );
}
