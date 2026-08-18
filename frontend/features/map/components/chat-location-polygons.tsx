"use client";

import { useMemo } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import { MapGeoJSON } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { categoryColorMatchExpression } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";

type ChatPolygonProperties = { locationId: string; category: string };
type FillColorExpression = NonNullable<FillLayerSpecification["paint"]>["fill-color"];
type LineColorExpression = NonNullable<LineLayerSpecification["paint"]>["line-color"];

/** Renders the Polygon subset of chatLocations with their real boundary shape (points render separately, see ChatLocationMarkers). */
export function ChatLocationPolygons() {
  const chatLocations = useMapStore((state) => state.chatLocations);
  const setSelectedChatLocationId = useMapStore((state) => state.setSelectedChatLocationId);
  const overrides = useCategoryColorStore((state) => state.overrides);

  const polygonLocations = useMemo(
    () => chatLocations.filter((location) => location.geometry.type === "Polygon"),
    [chatLocations],
  );
  const categories = useMemo(() => [...new Set(polygonLocations.map((location) => location.kind))], [polygonLocations]);

  const data = useMemo<FeatureCollection<Polygon, ChatPolygonProperties>>(
    () => ({
      type: "FeatureCollection",
      features: polygonLocations.map((location) => ({
        type: "Feature",
        geometry: location.geometry as Polygon,
        properties: { locationId: location.id, category: location.kind },
      })),
    }),
    [polygonLocations],
  );

  if (polygonLocations.length === 0) return null;

  return (
    <MapGeoJSON<ChatPolygonProperties>
      id="chat-location-polygons"
      data={data}
      promoteId="locationId"
      interactive
      fillPaint={{
        "fill-color": categoryColorMatchExpression(categories, overrides) as FillColorExpression,
        "fill-opacity": 0.25,
      }}
      linePaint={{
        "line-color": categoryColorMatchExpression(categories, overrides) as LineColorExpression,
        "line-width": 2,
      }}
      fillHoverPaint={{ "fill-opacity": 0.4 }}
      onClick={(e) => setSelectedChatLocationId(e.feature.properties.locationId)}
    />
  );
}
