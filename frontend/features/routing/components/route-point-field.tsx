"use client";

import { useState } from "react";
import { Crosshair, MapPin, Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGeocode } from "@/features/location/hooks/use-geocode";
import { geocodeResultProperties } from "@/features/location/lib/geocode-properties";
import type { GeocodeResult } from "@/features/location/types";
import { useRoutePlannerStore } from "@/features/routing/planner-store";
import { useMapStore } from "@/features/map/store";
import type { ChatLocation } from "@/features/map/types";

/** Origin/destination picker — geocode search or click-on-map — backed by useRoutePlannerStore. */
export function RoutePointField({ label, target }: { label: string; target: "origin" | "destination" }) {
  const [query, setQuery] = useState("");
  const geocode = useGeocode();
  const value = useRoutePlannerStore((state) => (target === "origin" ? state.origin : state.destination));
  const setValue = useRoutePlannerStore((state) => (target === "origin" ? state.setOrigin : state.setDestination));
  const pickTarget = useRoutePlannerStore((state) => state.pickTarget);
  const setPickTarget = useRoutePlannerStore((state) => state.setPickTarget);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);
  const isPicking = pickTarget === target;

  const handleSearch = () => {
    const text = query.trim();
    if (!text) return;
    geocode.mutate({ query: text, limit: 5 });
  };

  const selectResult = (result: GeocodeResult) => {
    setValue({ point: result.geometry, label: result.displayName, properties: geocodeResultProperties(result) });
    setQuery("");
    geocode.reset();
  };

  const pinToMap = () => {
    if (!value) return;
    const location: ChatLocation = {
      id: crypto.randomUUID(),
      kind: target === "origin" ? "waypoint" : "destination",
      label: value.label,
      geometry: value.point,
      properties: value.properties ?? {},
    };
    applyChatLocationsUpdate("add", [location], []);
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
            onClick={pinToMap}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Pin ${label.toLowerCase()} to map`}
          >
            <Pin className="size-3.5" />
          </button>
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
