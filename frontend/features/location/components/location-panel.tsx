"use client";

import { useState } from "react";
import { Loader2, MapPin, Pin, Search, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { BoundaryContactSelect } from "@/features/routing/components/filters/boundary-contact-select";
import { CategoryMultiSelect } from "@/features/routing/components/filters/category-multi-select";
import { OsmTagListEditor } from "@/features/routing/components/filters/osm-tag-list-editor";
import { WayTypesInput } from "@/features/routing/components/filters/way-types-input";
import { useGeocode } from "@/features/location/hooks/use-geocode";
import { geocodeResultProperties } from "@/features/location/lib/geocode-properties";
import type { GeocodeResult } from "@/features/location/types";
import { useSearchAreas } from "@/features/routing/hooks/use-search-areas";
import { areaMatchId } from "@/features/routing/lib/area-match-id";
import { chatLocationFromAreaMatch } from "@/features/routing/lib/area-match-location";
import { useMapStore } from "@/features/map/store";
import type { AreaSearchRequest } from "@/features/routing/types";

type SelectedPlace = {
  point: AreaSearchRequest["origin"];
  boundary: AreaSearchRequest["boundary"];
  label: string;
  properties: Record<string, string>;
};

type Scope = "near" | "within" | "drawn";

type Criteria = Omit<AreaSearchRequest, "origin" | "radiusM" | "boundary">;

const DEFAULT_CRITERIA: Criteria = {
  categories: [],
  rawTags: [],
  wayTypes: [],
  boundaryContact: "crosses",
  minAreaM2: null,
  minBoundaryCount: null,
  limit: 5,
};

function PlaceSearch({
  selected,
  onSelect,
}: {
  selected: SelectedPlace | null;
  onSelect: (next: SelectedPlace) => void;
}) {
  const [query, setQuery] = useState("");
  const geocode = useGeocode();
  const chatLocations = useMapStore((state) => state.chatLocations);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);

  const handleSearch = () => {
    const text = query.trim();
    if (!text) return;
    geocode.mutate({ query: text, limit: 8 });
  };

  const pin = (result: GeocodeResult) => {
    applyChatLocationsUpdate(
      "add",
      [
        {
          id: crypto.randomUUID(),
          kind: "geocode",
          label: result.displayName,
          geometry: result.geometry,
          properties: geocodeResultProperties(result),
        },
      ],
      [],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Search for a place, city, or address"
        />
        <Button type="button" size="icon" onClick={handleSearch} disabled={geocode.isPending || !query.trim()}>
          <Search className="size-4" />
        </Button>
      </div>

      {geocode.isError && <p className="text-xs text-destructive">Search failed — try a different query.</p>}

      {geocode.data && (
        <ul className="flex flex-col rounded-md border border-input">
          {geocode.data.length === 0 && <p className="p-2 text-sm text-muted-foreground">No matches found.</p>}
          {geocode.data.map((result, index) => (
            <li key={index} className="flex items-center border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    point: result.geometry,
                    boundary: result.boundary,
                    label: result.displayName,
                    properties: geocodeResultProperties(result),
                  })
                }
                className="flex flex-1 items-start gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-signal" />
                <span className="flex-1">
                  {result.displayName}
                  {result.boundary && <span className="ml-1.5 text-[10px] text-muted-foreground uppercase">has boundary</span>}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mr-1 rounded-none"
                onClick={() => pin(result)}
                aria-label={`Pin ${result.displayName} to map`}
              >
                <Pin className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm">
          <MapPin className="size-3.5 shrink-0 text-signal" />
          <span className="flex-1 truncate">{selected.label}</span>
        </div>
      )}

      {chatLocations.length > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">{chatLocations.length} pinned on map</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => applyChatLocationsUpdate("replace", [], [])}>
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function ScopePicker({
  scope,
  onScopeChange,
  place,
  radiusM,
  onRadiusChange,
}: {
  scope: Scope;
  onScopeChange: (next: Scope) => void;
  place: SelectedPlace | null;
  radiusM: number;
  onRadiusChange: (next: number) => void;
}) {
  const areaSelectDrawMode = useMapStore((state) => state.areaSelectDrawMode);
  const drawnArea = useMapStore((state) => state.selectedArea);
  const setAreaSelectDrawMode = useMapStore((state) => state.setAreaSelectDrawMode);
  const setDrawnArea = useMapStore((state) => state.setSelectedArea);
  const isDrawing = areaSelectDrawMode === "rectangle";

  const options: { value: Scope; label: string; disabled: boolean }[] = [
    { value: "near", label: "Near a point", disabled: !place },
    { value: "within", label: "Within a place", disabled: !place?.boundary },
    { value: "drawn", label: "Drawn area", disabled: false },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-normal text-muted-foreground">Scope</Label>
      <div className="flex gap-1.5">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={scope === option.value ? "default" : "outline"}
            disabled={option.disabled}
            className="flex-1"
            onClick={() => onScopeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {scope === "near" && (
        <div className="flex flex-col gap-1.5">
          {!place && <p className="text-xs text-muted-foreground">Search for a place above first.</p>}
          <Label className="text-xs font-normal text-muted-foreground">Radius: {(radiusM / 1000).toFixed(1)} km</Label>
          <Slider
            value={[radiusM]}
            min={500}
            max={50_000}
            step={500}
            onValueChange={(next) => onRadiusChange((next as number[])[0])}
          />
        </div>
      )}

      {scope === "within" && !place?.boundary && (
        <p className="text-xs text-muted-foreground">
          The selected place has no area boundary — pick a city, county, or park name, or use another scope.
        </p>
      )}

      {scope === "drawn" && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {drawnArea ? "Area drawn on map" : "Draw a rectangle on the map"}
          </span>
          <div className="flex gap-1.5">
            {drawnArea && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setDrawnArea(null)}
                aria-label="Clear drawn area"
              >
                <X className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant={isDrawing ? "default" : "outline"}
              size="sm"
              onClick={() => setAreaSelectDrawMode(isDrawing ? null : "rectangle")}
            >
              <Square className="size-3.5" />
              {isDrawing ? "Click + drag..." : drawnArea ? "Redraw" : "Draw"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LocationPanel() {
  const [place, setPlace] = useState<SelectedPlace | null>(null);
  const [scope, setScope] = useState<Scope>("near");
  const [radiusM, setRadiusM] = useState(8_000);
  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);

  const matchedAreas = useMapStore((state) => state.matchedAreas);
  const setSelectedMatchedAreaId = useMapStore((state) => state.setSelectedMatchedAreaId);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);
  const drawnArea = useMapStore((state) => state.selectedArea);
  const searchAreas = useSearchAreas();

  const selectPlace = (next: SelectedPlace) => {
    setPlace(next);
    setScope(next.boundary ? "within" : "near");
  };

  const canSubmit =
    !searchAreas.isPending &&
    ((scope === "near" && Boolean(place)) ||
      (scope === "within" && Boolean(place?.boundary)) ||
      (scope === "drawn" && Boolean(drawnArea)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const base = { ...criteria };
    if (scope === "near" && place) {
      searchAreas.mutate({ ...base, origin: place.point, radiusM });
    } else if (scope === "within" && place?.boundary) {
      searchAreas.mutate({ ...base, boundary: place.boundary });
    } else if (scope === "drawn" && drawnArea) {
      searchAreas.mutate({ ...base, boundary: drawnArea.geometry });
    }
  };

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
      <PlaceSearch selected={place} onSelect={selectPlace} />

      <ScopePicker scope={scope} onScopeChange={setScope} place={place} radiusM={radiusM} onRadiusChange={setRadiusM} />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Feature categories</Label>
        <CategoryMultiSelect
          value={criteria.categories ?? []}
          onChange={(next) => setCriteria({ ...criteria, categories: next })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Raw OSM tags</Label>
        <OsmTagListEditor
          value={criteria.rawTags ?? []}
          onChange={(next) => setCriteria({ ...criteria, rawTags: next })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Way types (e.g. trails, small roads)</Label>
        <WayTypesInput
          value={criteria.wayTypes ?? []}
          onChange={(next) => setCriteria({ ...criteria, wayTypes: next })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Boundary contact</Label>
        <BoundaryContactSelect
          value={criteria.boundaryContact}
          onChange={(next) => setCriteria({ ...criteria, boundaryContact: next })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-normal text-muted-foreground">Min area (m²)</Label>
          <Input
            type="number"
            min={0}
            value={criteria.minAreaM2 ?? ""}
            onChange={(e) => setCriteria({ ...criteria, minAreaM2: e.target.value ? Number(e.target.value) : null })}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-normal text-muted-foreground">Min boundary contacts</Label>
          <Input
            type="number"
            min={1}
            value={criteria.minBoundaryCount ?? ""}
            onChange={(e) =>
              setCriteria({ ...criteria, minBoundaryCount: e.target.value ? Number(e.target.value) : null })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {searchAreas.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
        Search
      </Button>

      {searchAreas.isError && <p className="text-xs text-destructive">Search failed — try again.</p>}

      {matchedAreas.length > 0 && (
        <ul className="flex flex-col rounded-md border border-input">
          {matchedAreas.map((area, index) => (
            <li key={areaMatchId(area, index)} className="flex items-center border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setSelectedMatchedAreaId(areaMatchId(area, index))}
                className="flex flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left text-sm hover:bg-accent"
              >
                <span>{area.name ?? area.category}</span>
                <span className="text-xs text-muted-foreground">
                  {area.areaM2 != null && area.exitCount != null
                    ? `${Math.round(area.areaM2).toLocaleString()} m² · ${area.exitCount} boundary contact${area.exitCount === 1 ? "" : "s"}`
                    : "Point feature"}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mr-1 rounded-none"
                onClick={() => applyChatLocationsUpdate("add", [chatLocationFromAreaMatch(area)], [])}
                aria-label={`Pin ${area.name ?? area.category} to map`}
              >
                <Pin className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {searchAreas.isSuccess && searchAreas.data.length === 0 && (
        <p className="text-xs text-muted-foreground">No area feature matched every criterion.</p>
      )}
    </form>
  );
}

