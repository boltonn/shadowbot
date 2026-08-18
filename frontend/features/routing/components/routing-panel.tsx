"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Pin, Route as RouteIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AvoidDatasetListEditor } from "@/features/routing/components/filters/avoid-dataset-list-editor";
import { AvoidPlacesEditor } from "@/features/routing/components/filters/avoid-places-editor";
import { BoundaryContactSelect } from "@/features/routing/components/filters/boundary-contact-select";
import { CategoryMultiSelect } from "@/features/routing/components/filters/category-multi-select";
import { OsmTagListEditor } from "@/features/routing/components/filters/osm-tag-list-editor";
import { WayTypesInput } from "@/features/routing/components/filters/way-types-input";
import { RoutePointField } from "@/features/routing/components/route-point-field";
import { chatLocationFromAreaMatch } from "@/features/routing/lib/area-match-location";
import { formatDistance, formatDuration } from "@/features/routing/lib/format";
import { usePlanRoute } from "@/features/routing/hooks/use-plan-route";
import { useSearchRoutes } from "@/features/routing/hooks/use-search-routes";
import { useRoutePlannerStore } from "@/features/routing/planner-store";
import { useMapStore } from "@/features/map/store";
import type { AvoidancePreferences, NetworkType, RouteSearchCriteria } from "@/features/routing/types";

const NETWORK_TYPES: { value: NetworkType; label: string }[] = [
  { value: "drive", label: "Drive" },
  { value: "drive_service", label: "Drive (service roads)" },
  { value: "walk", label: "Walk" },
  { value: "bike", label: "Bike" },
  { value: "all", label: "All roads" },
];

const ROAD_AVOID_OPTIONS: { key: keyof AvoidancePreferences; label: string }[] = [
  { key: "avoidTolls", label: "Tolls" },
  { key: "avoidHighways", label: "Highways" },
  { key: "avoidUnpaved", label: "Unpaved roads" },
  { key: "avoidFerries", label: "Ferries" },
];

type Criteria = Omit<RouteSearchCriteria, "origin" | "destination">;

const DEFAULT_CRITERIA: Criteria = {
  networkType: "drive",
  avoid: {
    avoidTolls: false,
    avoidHighways: false,
    avoidUnpaved: false,
    avoidFerries: false,
    excludePolygons: [],
    avoidPointDatasets: [],
  },
  avoidPlaces: [],
  avoidRadiusM: 300,
  throughCategories: [],
  throughRawTags: [],
  minAreaM2: null,
  minAreaExits: null,
  throughWayTypes: [],
  throughBoundaryContact: "crosses",
  areaCorridorM: 50,
  maxCandidates: 3,
};

/**
 * A route request escalates from a single planned route to a criteria search the moment it needs
 * something plan_route can't express: named avoid-places, or "passes through an area" criteria.
 * avoid_point_datasets works with a plain plan too, so setting those alone doesn't escalate.
 */
export function RoutingPanel() {
  const origin = useRoutePlannerStore((state) => state.origin);
  const destination = useRoutePlannerStore((state) => state.destination);
  const reset = useRoutePlannerStore((state) => state.reset);
  const matchedRoutes = useMapStore((state) => state.matchedRoutes);
  const selectMatchedRoute = useMapStore((state) => state.selectMatchedRoute);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);
  const planRoute = usePlanRoute();
  const searchRoutes = useSearchRoutes();

  const [criteria, setCriteria] = useState<Criteria>(DEFAULT_CRITERIA);
  const [wantsAvoidPlaces, setWantsAvoidPlaces] = useState(false);
  const [wantsArea, setWantsArea] = useState(false);

  const hasThroughCriteria = (criteria.throughCategories?.length ?? 0) > 0 || (criteria.throughRawTags?.length ?? 0) > 0;
  const hasAvoidPlaces = (criteria.avoidPlaces?.length ?? 0) > 0;
  const wantsSearch = hasThroughCriteria || hasAvoidPlaces;

  const isPending = planRoute.isPending || searchRoutes.isPending;
  const canSubmit = Boolean(origin && destination) && !isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) return;
    if (wantsSearch) {
      searchRoutes.mutate({
        ...criteria,
        origin: origin.point,
        destination: destination.point,
        minAreaM2: wantsArea ? criteria.minAreaM2 : null,
        minAreaExits: wantsArea ? criteria.minAreaExits : null,
      });
    } else {
      planRoute.mutate({
        origin: origin.point,
        destination: destination.point,
        networkType: criteria.networkType,
        maxAlternates: 0,
        avoid: criteria.avoid,
      });
    }
  };

  const handleReset = () => {
    reset();
    setCriteria(DEFAULT_CRITERIA);
    planRoute.reset();
    searchRoutes.reset();
  };

  return (
    <form className="flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
      <RoutePointField label="Origin" target="origin" />
      <RoutePointField label="Destination" target="destination" />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-normal text-muted-foreground">Travel mode</Label>
        <Select
          value={criteria.networkType}
          onValueChange={(value) => value && setCriteria({ ...criteria, networkType: value as NetworkType })}
        >
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
        {ROAD_AVOID_OPTIONS.map((option) => (
          <div key={option.key} className="flex items-center justify-between">
            <Label htmlFor={`avoid-${option.key}`} className="text-sm font-normal">
              {option.label}
            </Label>
            <Switch
              id={`avoid-${option.key}`}
              checked={Boolean(criteria.avoid?.[option.key])}
              onCheckedChange={(checked) =>
                setCriteria({
                  ...criteria,
                  avoid: { ...DEFAULT_CRITERIA.avoid, ...criteria.avoid, [option.key]: checked } as AvoidancePreferences,
                })
              }
            />
          </div>
        ))}
      </div>

      <Collapsible open={wantsAvoidPlaces} onOpenChange={setWantsAvoidPlaces}>
        <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          <ChevronRight className={wantsAvoidPlaces ? "size-3 rotate-90 transition-transform" : "size-3 transition-transform"} />
          Avoid specific places
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 pt-2.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Named places or roads</Label>
            <AvoidPlacesEditor
              places={criteria.avoidPlaces ?? []}
              radiusM={criteria.avoidRadiusM ?? 300}
              onPlacesChange={(next) => setCriteria({ ...criteria, avoidPlaces: next })}
              onRadiusChange={(next) => setCriteria({ ...criteria, avoidRadiusM: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Uploaded dataset categories (cameras, checkpoints, etc.)</Label>
            <AvoidDatasetListEditor
              value={criteria.avoid?.avoidPointDatasets ?? []}
              onChange={(next) =>
                setCriteria({
                  ...criteria,
                  avoid: { ...DEFAULT_CRITERIA.avoid, ...criteria.avoid, avoidPointDatasets: next } as AvoidancePreferences,
                })
              }
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={wantsArea} onOpenChange={setWantsArea}>
        <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          <ChevronRight className={wantsArea ? "size-3 rotate-90 transition-transform" : "size-3 transition-transform"} />
          Passes through an area
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 pt-2.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Feature categories</Label>
            <CategoryMultiSelect
              value={criteria.throughCategories ?? []}
              onChange={(next) => setCriteria({ ...criteria, throughCategories: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Raw OSM tags</Label>
            <OsmTagListEditor
              value={criteria.throughRawTags ?? []}
              onChange={(next) => setCriteria({ ...criteria, throughRawTags: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Way types (e.g. trails, small roads)</Label>
            <WayTypesInput
              value={criteria.throughWayTypes ?? []}
              onChange={(next) => setCriteria({ ...criteria, throughWayTypes: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-normal text-muted-foreground">Boundary contact</Label>
            <BoundaryContactSelect
              value={criteria.throughBoundaryContact}
              onChange={(next) => setCriteria({ ...criteria, throughBoundaryContact: next })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Min area (m²)</Label>
              <Input
                type="number"
                min={0}
                value={criteria.minAreaM2 ?? ""}
                onChange={(e) =>
                  setCriteria({ ...criteria, minAreaM2: e.target.value ? Number(e.target.value) : null })
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Min boundary contacts</Label>
              <Input
                type="number"
                min={1}
                value={criteria.minAreaExits ?? ""}
                onChange={(e) =>
                  setCriteria({ ...criteria, minAreaExits: e.target.value ? Number(e.target.value) : null })
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : wantsSearch ? (
            <Search className="size-3.5" />
          ) : (
            <RouteIcon className="size-3.5" />
          )}
          {wantsSearch ? "Search routes" : "Plan route"}
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </div>

      {planRoute.isError && (
        <p className="text-xs text-destructive">Couldn&apos;t plan that route — check both points and try again.</p>
      )}
      {searchRoutes.isError && (
        <p className="text-xs text-destructive">Search failed — check both points and try again.</p>
      )}

      {matchedRoutes.length > 0 && (
        <ul className="flex flex-col rounded-md border border-input">
          {matchedRoutes.map((match) => {
            const area = match.matchedArea;
            return (
              <li key={match.route.id} className="flex items-center border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => selectMatchedRoute(match.route.id)}
                  className="flex flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>
                    {formatDistance(match.route.distanceM)} · {formatDuration(match.route.durationS)}
                  </span>
                  {area && (
                    <span className="text-xs text-muted-foreground">
                      through {area.name ?? area.category} ({area.exitCount} boundary contact
                      {area.exitCount === 1 ? "" : "s"})
                    </span>
                  )}
                </button>
                {area && (
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
                )}
              </li>
            );
          })}
        </ul>
      )}
      {searchRoutes.isSuccess && searchRoutes.data.length === 0 && (
        <p className="text-xs text-muted-foreground">No candidate route matched every criterion.</p>
      )}
    </form>
  );
}
