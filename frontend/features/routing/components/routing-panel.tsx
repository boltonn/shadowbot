"use client";

import { useState } from "react";
import { Ban, Route as RouteIcon, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { LocationSearchField } from "@/features/routing/components/location-search-field";
import { useCreateRoute } from "@/features/routing/hooks/use-create-route";
import { useReroute } from "@/features/routing/hooks/use-reroute";
import { useMapStore } from "@/features/map/store";
import { defaultAvoidance, type AvoidancePreferences, type GeocodeResult } from "@/features/routing/types";

const AVOIDANCE_OPTIONS: { key: keyof Omit<AvoidancePreferences, "excludePolygons">; label: string }[] = [
  { key: "avoidTolls", label: "Tolls" },
  { key: "avoidHighways", label: "Highways" },
  { key: "avoidUnpaved", label: "Unpaved roads" },
  { key: "avoidFerries", label: "Ferries" },
];

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function RoutingPanel() {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [avoid, setAvoid] = useState<AvoidancePreferences>(defaultAvoidance);

  const activeRoute = useMapStore((state) => state.activeRoute);
  const excludePolygons = useMapStore((state) => state.excludePolygons);
  const isExcludeMode = useMapStore((state) => state.isExcludeMode);
  const setActiveRoute = useMapStore((state) => state.setActiveRoute);
  const setExcludeMode = useMapStore((state) => state.setExcludeMode);
  const clearExcludePolygons = useMapStore((state) => state.clearExcludePolygons);

  const createRoute = useCreateRoute();
  const rerouteMutation = useReroute();

  const canPlan = origin && destination;

  const handlePlan = () => {
    if (!origin || !destination) return;
    createRoute.mutate(
      {
        origin: origin.geometry,
        destination: destination.geometry,
        avoid: { ...avoid, excludePolygons },
      },
      { onSuccess: setActiveRoute },
    );
  };

  const handleDifferentWay = () => {
    if (!activeRoute) return;
    rerouteMutation.mutate(
      {
        routeId: activeRoute.id,
        request: { avoid: { ...avoid, excludePolygons }, avoidPriorRoute: true },
      },
      { onSuccess: setActiveRoute },
    );
  };

  const isPending = createRoute.isPending || rerouteMutation.isPending;

  return (
    <div className="flex flex-col gap-4 p-4">
      <LocationSearchField label="Origin" value={origin} onChange={setOrigin} />
      <LocationSearchField label="Destination" value={destination} onChange={setDestination} />

      <Separator />

      <div className="flex flex-col gap-2.5">
        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          Avoid
        </span>
        {AVOIDANCE_OPTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label htmlFor={key} className="text-sm font-normal">
              {label}
            </Label>
            <Switch
              id={key}
              checked={avoid[key]}
              onCheckedChange={(checked) => setAvoid((prev) => ({ ...prev, [key]: checked }))}
            />
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm">
            Exclude zones
            {excludePolygons.length > 0 && (
              <span className="ml-1.5 font-mono text-signal">{excludePolygons.length}</span>
            )}
          </span>
          <div className="flex gap-1.5">
            {excludePolygons.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-none"
                onClick={clearExcludePolygons}
                aria-label="Clear exclude zones"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant={isExcludeMode ? "default" : "outline"}
              size="sm"
              className="rounded-none"
              onClick={() => setExcludeMode(!isExcludeMode)}
            >
              <Ban className="size-3.5" />
              {isExcludeMode ? "Click map..." : "Add zone"}
            </Button>
          </div>
        </div>
      </div>

      <Button
        type="button"
        className="rounded-none"
        disabled={!canPlan || isPending}
        onClick={handlePlan}
      >
        <RouteIcon className="size-4" />
        Plan route
      </Button>

      {createRoute.isError && (
        <p className="text-xs text-destructive">Couldn&apos;t find a route with those constraints.</p>
      )}

      {activeRoute && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              Route
            </span>
            <div className="flex items-center justify-between font-mono text-sm">
              <span className="text-trace">{formatDistance(activeRoute.distanceM)}</span>
              <span className="text-muted-foreground">{formatDuration(activeRoute.durationS)}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none"
              disabled={isPending}
              onClick={handleDifferentWay}
            >
              <Shuffle className="size-3.5" />
              Take a different way
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
