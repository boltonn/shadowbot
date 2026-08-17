"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type { FillLayerSpecification, GeoJSONSource, LineLayerSpecification, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { useSuspenseDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import { categoryColorMatchExpression, FALLBACK_CATEGORY_COLOR } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { useMapStore } from "@/features/map/store";

type PolygonProperties = { polygonId: string; category: string; name: string | null };
type FillColorExpression = NonNullable<FillLayerSpecification["paint"]>["fill-color"];
type LineColorExpression = NonNullable<LineLayerSpecification["paint"]>["line-color"];

function fillColorExpression(categories: string[], overrides: Record<string, string>): FillColorExpression {
  if (categories.length === 0) return FALLBACK_CATEGORY_COLOR as FillColorExpression;
  return categoryColorMatchExpression(categories, overrides) as FillColorExpression;
}

function lineColorExpression(categories: string[], overrides: Record<string, string>): LineColorExpression {
  if (categories.length === 0) return FALLBACK_CATEGORY_COLOR as LineColorExpression;
  return categoryColorMatchExpression(categories, overrides) as LineColorExpression;
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Polygon, PolygonProperties> = {
  type: "FeatureCollection",
  features: [],
};

export function PolygonDatasetLayer({ datasetId }: { datasetId: string }) {
  const { map, isLoaded } = useMap();
  const { data } = useSuspenseDatasetDetail(datasetId);
  const dataset = data.geometryKind === "polygon" ? data : undefined;
  const filterSet = useMapStore((state) => state.filteredFeatureIds[datasetId]) ?? null;
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const overrides = useCategoryColorStore((state) => state.overrides);
  const hasFitRef = useRef(false);

  const sourceId = `polygon-dataset-${datasetId}`;
  const fillLayerId = `${sourceId}-fill`;
  const outlineLayerId = `${sourceId}-outline`;

  const polygons = useMemo(
    () => (dataset ? (filterSet ? dataset.polygons.filter((polygon) => filterSet.has(polygon.id)) : dataset.polygons) : []),
    [dataset, filterSet],
  );

  const geojsonData = useMemo<FeatureCollection<Polygon, PolygonProperties>>(
    () => ({
      type: "FeatureCollection",
      features: polygons.map((polygon) => ({
        type: "Feature",
        geometry: polygon.geometry,
        properties: { polygonId: polygon.id, category: polygon.category, name: polygon.name },
      })),
    }),
    [polygons],
  );

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
        "fill-color": fillColorExpression(categories, overrides),
        "fill-opacity": 0.25,
      },
    });

    map.addLayer({
      id: outlineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": lineColorExpression(categories, overrides),
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
      map.setPaintProperty(fillLayerId, "fill-color", fillColorExpression(categories, overrides));
    }
    if (map.getLayer(outlineLayerId)) {
      map.setPaintProperty(outlineLayerId, "line-color", lineColorExpression(categories, overrides));
    }
  }, [isLoaded, map, geojsonData, categories, overrides, sourceId, fillLayerId, outlineLayerId]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const polygonId = feature.properties?.polygonId as string;
      setSelectedFeature({ datasetId, featureId: polygonId });
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
  }, [isLoaded, map, fillLayerId, datasetId, setSelectedFeature]);

  return null;
}
