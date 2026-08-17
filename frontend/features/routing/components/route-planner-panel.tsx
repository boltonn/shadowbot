"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, Route as RouteIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useGeocode } from "@/features/location/hooks/use-geocode";
import type { GeocodeResult } from "@/features/location/types";
import { usePlanRoute } from "@/features/routing/hooks/use-plan-route";
import { useRoutePlannerStore } from "@/features/routing/planner-store";
import type { NetworkType } from "@/features/routing/types";

const NETWORK_TYPES: { value: NetworkType; label: string }[] = [
  { value: "drive", label: "Drive" },
  { value: "drive_service", label: "Drive (service roads)" },
  { value: "walk", label: "Walk" },
  { value: "bike", label: "Bike" },
  { value: "all", label: "All roads" },
];

function RoutePointField({ label, target }: { label: string; target: "origin" | "destination" }) {
  const [query, setQuery] = useState("");
  const geocode = useGeocode();
  const value = useRoutePlannerStore((state) => (target === "origin" ? state.origin : state.destination));
  const setValue = useRoutePlannerStore((state) => (target === "origin" ? state.setOrigin : state.setDestination));
  const pickTarget = useRoutePlannerStore((state) => state.pickTarget);
  const setPickTarget = useRoutePlannerStore((state) => state.setPickTarget);
  const isPicking = pickTarget === target;

  const handleSearch = () => {
    const text = query.trim();
    if (!text) return;
    geocode.mutate({ query: text, limit: 5 });
  };

  const selectResult = (result: GeocodeResult) => {
    setValue({ point: result.geometry, label: result.displayName });
    setQuery("");
    geocode.reset();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm">
          <MapPin className="size-3.5 shrink-0 text-signal" />
          <span className="flex-1 truncate">{value.label}</span>
          <button
            type="button"
            onClick={() => setValue(null)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="icon-sm"
              variant={isPicking ? "default" : "outline"}
              onClick={() => setPickTarget(isPicking ? null : target)}
              aria-label="Pick on map"
            >
              <Crosshair className="size-3.5" />
            </Button>
          </div>
          {isPicking && (
            <p className="text-[11px] text-signal">Click the map to set {label.toLowerCase()}...</p>
          )}
          {geocode.isPending && <p className="text-[11px] text-muted-foreground">Searching...</p>}
          {geocode.data && geocode.data.length > 0 && (
            <ul className="flex flex-col rounded-md border border-input">
              {geocode.data.map((result, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => selectResult(result)}
                    className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{result.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function RoutePlannerPanel() {
  const origin = useRoutePlannerStore((state) => state.origin);
  const destination = useRoutePlannerStore((state) => state.destination);
  const reset = useRoutePlannerStore((state) => state.reset);
  const planRoute = usePlanRoute();

  const [networkType, setNetworkType] = useState<NetworkType>("drive");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [avoidUnpaved, setAvoidUnpaved] = useState(false);
  const [avoidFerries, setAvoidFerries] = useState(false);

  const canSubmit = Boolean(origin && destination) && !planRoute.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) return;
    planRoute.mutate({
      origin: origin.point,
      destination: destination.point,
      networkType,
      maxAlternates: 0,
      avoid: {
        avoidTolls,
        avoidHighways,
        avoidUnpaved,
        avoidFerries,
        excludePolygons: [],
      },
    });
  };

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
      <RoutePointField label="Origin" target="origin" />
      <RoutePointField label="Destination" target="destination" />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Travel mode</Label>
        <Select value={networkType} onValueChange={(value) => value && setNetworkType(value as NetworkType)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NETWORK_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Avoid</span>
        {[
          { key: "tolls", label: "Tolls", checked: avoidTolls, onCheckedChange: setAvoidTolls },
          { key: "highways", label: "Highways", checked: avoidHighways, onCheckedChange: setAvoidHighways },
          { key: "unpaved", label: "Unpaved roads", checked: avoidUnpaved, onCheckedChange: setAvoidUnpaved },
          { key: "ferries", label: "Ferries", checked: avoidFerries, onCheckedChange: setAvoidFerries },
        ].map((option) => (
          <div key={option.key} className="flex items-center justify-between">
            <Label htmlFor={`avoid-${option.key}`} className="text-sm font-normal">
              {option.label}
            </Label>
            <Switch id={`avoid-${option.key}`} checked={option.checked} onCheckedChange={option.onCheckedChange} />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {planRoute.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RouteIcon className="size-3.5" />
          )}
          Plan route
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          Reset
        </Button>
      </div>

      {planRoute.isError && (
        <p className="text-xs text-destructive">Couldn&apos;t plan that route — check both points and try again.</p>
      )}
    </form>
  );
}
