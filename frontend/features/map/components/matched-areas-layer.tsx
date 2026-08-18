"use client";

import { useMemo } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import { Pin } from "lucide-react";
import { MapGeoJSON, MapMarker, MapPopup, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { useMapStore } from "@/features/map/store";
import { areaMatchId } from "@/features/routing/lib/area-match-id";
import { areaMatchProperties, chatLocationFromAreaMatch } from "@/features/routing/lib/area-match-location";
import { centroidOf } from "@/features/map/lib/geometry";
import { categoryColorMatchExpression, colorForCategory, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { RawPropertiesDisclosure } from "@/features/map/components/raw-properties-disclosure";
import type { AreaMatch } from "@/features/routing/types";

type MatchedAreaProperties = { matchId: string; category: string };
type FillColorExpression = NonNullable<FillLayerSpecification["paint"]>["fill-color"];
type LineColorExpression = NonNullable<LineLayerSpecification["paint"]>["line-color"];

const HOVER_PAINT = { "fill-opacity": 0.32 };

/** Renders candidate AreaMatch results (polygons as filled shapes, points as pins) from both standalone area search and route search's matched_area. */
export function MatchedAreasLayer() {
  const { map } = useMap();
  const matchedAreas = useMapStore((state) => state.matchedAreas);
  const matchedRoutes = useMapStore((state) => state.matchedRoutes);
  const selectedMatchedAreaId = useMapStore((state) => state.selectedMatchedAreaId);
  const setSelectedMatchedAreaId = useMapStore((state) => state.setSelectedMatchedAreaId);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);
  const overrides = useCategoryColorStore((state) => state.overrides);

  const areas = useMemo(() => {
    const fromRoutes = matchedRoutes
      .map((match) => match.matchedArea)
      .filter((area): area is AreaMatch => area !== null);
    const combined = [...matchedAreas, ...fromRoutes];
    const seen = new Set<string>();
    const deduped: { id: string; area: AreaMatch }[] = [];
    combined.forEach((area, index) => {
      const id = areaMatchId(area, index);
      if (seen.has(id)) return;
      seen.add(id);
      deduped.push({ id, area });
    });
    return deduped;
  }, [matchedAreas, matchedRoutes]);

  const polygonAreas = useMemo(() => areas.filter(({ area }) => area.geometry.type === "Polygon"), [areas]);
  const pointAreas = useMemo(() => areas.filter(({ area }) => area.geometry.type === "Point"), [areas]);

  const data = useMemo<FeatureCollection<Polygon, MatchedAreaProperties>>(
    () => ({
      type: "FeatureCollection",
      features: polygonAreas.map(({ id, area }) => ({
        type: "Feature",
        geometry: area.geometry as Polygon,
        properties: { matchId: id, category: area.category },
      })),
    }),
    [polygonAreas],
  );

  const categories = useMemo(() => [...new Set(areas.map(({ area }) => area.category))], [areas]);

  const selected = areas.find(({ id }) => id === selectedMatchedAreaId) ?? null;

  if (areas.length === 0) return null;

  return (
    <>
      <MapGeoJSON<MatchedAreaProperties>
        id="matched-areas"
        data={data}
        promoteId="matchId"
        interactive
        fillPaint={{
          "fill-color": categoryColorMatchExpression(categories, overrides) as FillColorExpression,
          "fill-opacity": 0.18,
        }}
        linePaint={{
          "line-color": categoryColorMatchExpression(categories, overrides) as LineColorExpression,
          "line-width": 2,
        }}
        fillHoverPaint={HOVER_PAINT}
        onClick={(e) => {
          setSelectedMatchedAreaId(e.feature.properties.matchId);
          if (map) map.easeTo({ center: [e.longitude, e.latitude], duration: 300 });
        }}
      />
      {pointAreas.map(({ id, area }) => {
        const Icon = iconForCategory(area.category);
        const [longitude, latitude] = centroidOf(area.geometry);
        return (
          <MapMarker key={id} longitude={longitude} latitude={latitude} onClick={() => setSelectedMatchedAreaId(id)}>
            <MarkerContent>
              <Icon
                className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                style={{ color: colorForCategory(area.category, overrides) }}
                strokeWidth={2.5}
              />
            </MarkerContent>
            <MarkerTooltip>{area.name ?? area.category}</MarkerTooltip>
          </MapMarker>
        );
      })}
      {selected && (
        <MapPopup
          longitude={centroidOf(selected.area.geometry)[0]}
          latitude={centroidOf(selected.area.geometry)[1]}
          onClose={() => setSelectedMatchedAreaId(null)}
          closeButton
        >
          <div className="w-56">
            <p className="text-sm font-medium">{selected.area.name ?? selected.area.category}</p>
            {selected.area.areaM2 != null && selected.area.exitCount != null && (
              <p className="text-xs text-muted-foreground">
                {Math.round(selected.area.areaM2).toLocaleString()} m² · {selected.area.exitCount} boundary contact
                {selected.area.exitCount === 1 ? "" : "s"}
              </p>
            )}
            <RawPropertiesDisclosure properties={areaMatchProperties(selected.area)} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                applyChatLocationsUpdate("add", [chatLocationFromAreaMatch(selected.area)], []);
                setSelectedMatchedAreaId(null);
              }}
            >
              <Pin className="size-3.5" />
              Pin to map
            </Button>
          </div>
        </MapPopup>
      )}
    </>
  );
}
