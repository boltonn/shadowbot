"use client";

import { useState } from "react";
import { MapPin, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGeocode } from "@/features/location/hooks/use-geocode";
import type { GeocodeResult } from "@/features/location/types";
import { useMapStore } from "@/features/map/store";

/** Flattens a geocode result's raw OSM identity/address into the string map ChatLocation carries. */
function geocodeResultProperties(result: GeocodeResult): Record<string, string> {
  const properties: Record<string, string> = {};
  if (result.osmType) properties.osmType = result.osmType;
  if (result.osmId) properties.osmId = String(result.osmId);
  if (result.osmClass) properties.osmClass = result.osmClass;
  if (result.placeType) properties.placeType = result.placeType;
  if (result.url) properties.url = result.url;
  for (const [key, value] of Object.entries(result.address)) {
    properties[`address:${key}`] = value;
  }
  return properties;
}

export function FindLocationPanel() {
  const [query, setQuery] = useState("");
  const geocode = useGeocode();
  const chatLocations = useMapStore((state) => state.chatLocations);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    geocode.mutate({ query: text, limit: 8 });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <form className="flex gap-2" onSubmit={handleSearch}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a place or address"
        />
        <Button type="submit" size="icon" disabled={geocode.isPending || !query.trim()}>
          <Search className="size-4" />
        </Button>
      </form>

      {geocode.isError && (
        <p className="text-xs text-destructive">Search failed — try a different query.</p>
      )}

      {geocode.data && (
        <ul className="flex flex-col gap-1">
          {geocode.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No matches found.</p>
          )}
          {geocode.data.map((result, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() =>
                  applyChatLocationsUpdate(
                    "add",
                    [
                      {
                        id: crypto.randomUUID(),
                        kind: "geocode",
                        label: result.displayName,
                        longitude: result.geometry.coordinates[0],
                        latitude: result.geometry.coordinates[1],
                        properties: geocodeResultProperties(result),
                      },
                    ],
                    [],
                  )
                }
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-signal" />
                <span className="flex-1">{result.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chatLocations.length > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {chatLocations.length} pinned on map
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyChatLocationsUpdate("replace", [], [])}>
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
