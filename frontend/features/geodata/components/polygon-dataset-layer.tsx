"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type { FillLayerSpecification, GeoJSONSource, LineLayerSpecification, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { MapPopup, useMap } from "@/components/ui/map";
import { useDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import { categoryColorMatchExpression } from "@/features/geodata/lib/category-icons";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import type { PolygonDatasetDetail } from "@/features/geodata/types";

type PolygonProperties = { polygonId: string; category: string; name: string | null };
type FillColorExpression = NonNullable<FillLayerSpecification["paint"]>["fill-color"];
type LineColorExpression = NonNullable<LineLayerSpecification["paint"]>["line-color"];

function fillColorExpression(categories: string[]): FillColorExpression {
  if (categories.length === 0) return "#8a9099" as FillColorExpression;
  return categoryColorMatchExpression(categories) as FillColorExpression;
}

function lineColorExpression(categories: string[]): LineColorExpression {
  if (categories.length === 0) return "#8a9099" as LineColorExpression;
  return categoryColorMatchExpression(categories) as LineColorExpression;
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Polygon, PolygonProperties> = {
  type: "FeatureCollection",
  features: [],
};

type OpenPopup = { longitude: number; latitude: number; name: string; category: string };

export function PolygonDatasetLayer({ datasetId }: { datasetId: string }) {
  const { map, isLoaded } = useMap();
  const { data } = useDatasetDetail(datasetId, true);
  const dataset = data && data.geometryKind === "polygon" ? (data as PolygonDatasetDetail) : undefined;
  const hasFitRef = useRef(false);
  const [openPopup, setOpenPopup] = useState<OpenPopup | null>(null);

  const sourceId = `polygon-dataset-${datasetId}`;
  const fillLayerId = `${sourceId}-fill`;
  const outlineLayerId = `${sourceId}-outline`;

  const geojsonData = useMemo<FeatureCollection<Polygon, PolygonProperties>>(() => {
    if (!dataset) return EMPTY_FEATURE_COLLECTION;
    return {
      type: "FeatureCollection",
      features: dataset.polygons.map((polygon) => ({
        type: "Feature",
        geometry: polygon.geometry,
        properties: { polygonId: polygon.id, category: polygon.category, name: polygon.name },
      })),
    };
  }, [dataset]);

  useEffect(() => {
    if (!map || !dataset || dataset.polygons.length === 0 || hasFitRef.current) return;
    hasFitRef.current = true;
    fitToCoordinates(map, dataset.polygons.flatMap((polygon) => polygon.geometry.coordinates[0] as [number, number][]));
  }, [map, dataset]);

  const categories = useMemo(() => dataset?.categories ?? [], [dataset]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    map.addSource(sourceId, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColorExpression(categories),
        "fill-opacity": 0.25,
      },
    });

    map.addLayer({
      id: outlineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": lineColorExpression(categories),
        "line-width": 2,
      },
    });

    return () => {
      try {
        if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // style may be mid-reload
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, sourceId]);

  useEffect(() => {
    if (!isLoaded || !map) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(geojsonData);
    if (map.getLayer(fillLayerId)) {
      map.setPaintProperty(fillLayerId, "fill-color", fillColorExpression(categories));
    }
    if (map.getLayer(outlineLayerId)) {
      map.setPaintProperty(outlineLayerId, "line-color", lineColorExpression(categories));
    }
  }, [isLoaded, map, geojsonData, categories, sourceId, fillLayerId, outlineLayerId]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const category = feature.properties?.category as string;
      setOpenPopup({
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
        name: (feature.properties?.name as string) || category,
        category,
      });
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", fillLayerId, handleClick);
    map.on("mouseenter", fillLayerId, setPointer);
    map.on("mouseleave", fillLayerId, clearPointer);

    return () => {
      map.off("click", fillLayerId, handleClick);
      map.off("mouseenter", fillLayerId, setPointer);
      map.off("mouseleave", fillLayerId, clearPointer);
    };
  }, [isLoaded, map, fillLayerId]);

  if (!openPopup) return null;

  return (
    <MapPopup longitude={openPopup.longitude} latitude={openPopup.latitude} onClose={() => setOpenPopup(null)} closeButton>
      <p className="text-sm font-medium">{openPopup.name}</p>
      <p className="text-xs text-muted-foreground capitalize">{openPopup.category}</p>
    </MapPopup>
  );
}
