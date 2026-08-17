"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, Point } from "geojson";
import * as MapLibreGL from "maplibre-gl";
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { MapMarker, MarkerContent, MarkerTooltip, useMap } from "@/components/ui/map";
import { useSuspenseDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import type { PointFeature } from "@/features/geodata/types";
import { categoryColorMatchExpression, colorForCategory, FALLBACK_CATEGORY_COLOR, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { useMapStore } from "@/features/map/store";

// Below this many points, render individual icon markers — the map stays
// legible and icons carry more information than a colored dot. At or above
// it, switch to a clustered layer so dense datasets don't turn into an
// unreadable pile of overlapping markers.
const ICON_MODE_MAX_POINTS = 50;

const CLUSTER_RADIUS = 50;
const CLUSTER_MAX_ZOOM = 15;

type PointProperties = { pointId: string; category: string; name: string | null };
type CircleColorExpression = NonNullable<MapLibreGL.CircleLayerSpecification["paint"]>["circle-color"];

function categoryColorExpression(categories: string[], overrides: Record<string, string>): CircleColorExpression {
  if (categories.length === 0) return FALLBACK_CATEGORY_COLOR as CircleColorExpression;
  return categoryColorMatchExpression(categories, overrides) as CircleColorExpression;
}

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Point, PointProperties> = { type: "FeatureCollection", features: [] };

export function PointDatasetLayer({ datasetId }: { datasetId: string }) {
  const { map } = useMap();
  const { data } = useSuspenseDatasetDetail(datasetId);
  const dataset = data.geometryKind === "point" ? data : undefined;
  const filterSet = useMapStore((state) => state.filteredFeatureIds[datasetId]) ?? null;
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const hasFitRef = useRef(false);

  useEffect(() => {
    if (!map || !dataset || dataset.points.length === 0 || hasFitRef.current) return;
    hasFitRef.current = true;
    fitToCoordinates(
      map,
      dataset.points.map((point) => point.geometry.coordinates as [number, number]),
    );
  }, [map, dataset]);

  if (!dataset) return null;

  const points = filterSet ? dataset.points.filter((point) => filterSet.has(point.id)) : dataset.points;

  if (points.length <= ICON_MODE_MAX_POINTS) {
    return <PointDatasetIcons datasetId={datasetId} points={points} onSelect={setSelectedFeature} />;
  }

  return (
    <PointDatasetCluster
      datasetId={datasetId}
      points={points}
      categories={dataset.categories}
      onSelect={setSelectedFeature}
    />
  );
}

type SelectFeature = (feature: { datasetId: string; featureId: string }) => void;

/** Small datasets: one icon marker per point, colored and shaped by category. */
function PointDatasetIcons({
  datasetId,
  points,
  onSelect,
}: {
  datasetId: string;
  points: PointFeature[];
  onSelect: SelectFeature;
}) {
  const overrides = useCategoryColorStore((state) => state.overrides);

  return (
    <>
      {points.map((point) => {
        const Icon = iconForCategory(point.category);
        const [longitude, latitude] = point.geometry.coordinates as [number, number];
        return (
          <MapMarker
            key={point.id}
            longitude={longitude}
            latitude={latitude}
            onClick={() => onSelect({ datasetId, featureId: point.id })}
          >
            <MarkerContent>
              <Icon
                className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                style={{ color: colorForCategory(point.category, overrides) }}
                strokeWidth={2.5}
              />
            </MarkerContent>
            <MarkerTooltip>{point.name ?? point.category}</MarkerTooltip>
          </MapMarker>
        );
      })}
    </>
  );
}

/**
 * Large datasets: a native MapLibre clustered layer instead of one DOM marker
 * per point. Nearby points bundle into a count circle at low zoom; zooming in
 * (or clicking a cluster) reveals individual points colored by category, so
 * the map stays legible at any dataset size.
 */
function PointDatasetCluster({
  datasetId,
  points,
  categories,
  onSelect,
}: {
  datasetId: string;
  points: PointFeature[];
  categories: string[];
  onSelect: SelectFeature;
}) {
  const { map, isLoaded } = useMap();
  const overrides = useCategoryColorStore((state) => state.overrides);

  const sourceId = `point-dataset-${datasetId}`;
  const clusterLayerId = `${sourceId}-clusters`;
  const clusterCountLayerId = `${sourceId}-cluster-count`;
  const pointLayerId = `${sourceId}-points`;

  const data = useMemo<FeatureCollection<Point, PointProperties>>(
    () => ({
      type: "FeatureCollection",
      features: points.map((point) => ({
        type: "Feature",
        geometry: point.geometry,
        properties: { pointId: point.id, category: point.category, name: point.name },
      })),
    }),
    [points],
  );

  // Add the clustered source + layers on mount. Seeded with empty data since the
  // dataset detail fetch resolves after mount; the sync effect below populates it.
  useEffect(() => {
    if (!isLoaded || !map) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: EMPTY_FEATURE_COLLECTION,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
    });

    map.addLayer({
      id: clusterLayerId,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#ffb020",
        "circle-opacity": 0.85,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#171717",
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
      },
    });

    map.addLayer({
      id: clusterCountLayerId,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
      },
      paint: { "text-color": "#171717" },
    });

    map.addLayer({
      id: pointLayerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": categoryColorExpression(categories, overrides),
        "circle-radius": 6,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#171717",
      },
    });

    return () => {
      try {
        if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
        if (map.getLayer(clusterCountLayerId)) map.removeLayer(clusterCountLayerId);
        if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // style may be mid-reload
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, sourceId]);

  // Keep the source data (and category colors) in sync without re-adding layers.
  useEffect(() => {
    if (!isLoaded || !map) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
    if (map.getLayer(pointLayerId)) {
      map.setPaintProperty(pointLayerId, "circle-color", categoryColorExpression(categories, overrides));
    }
  }, [isLoaded, map, data, categories, overrides, sourceId, pointLayerId]);

  // Interactions: click a cluster to zoom into it, click a point to see its label.
  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleClusterClick = async (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [clusterLayerId] })[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id as number;
      const source = map.getSource(sourceId) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom, duration: 500 });
    };

    const handlePointClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const pointId = feature.properties?.pointId as string;
      onSelect({ datasetId, featureId: pointId });
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", clusterLayerId, handleClusterClick);
    map.on("click", pointLayerId, handlePointClick);
    map.on("mouseenter", clusterLayerId, setPointer);
    map.on("mouseleave", clusterLayerId, clearPointer);
    map.on("mouseenter", pointLayerId, setPointer);
    map.on("mouseleave", pointLayerId, clearPointer);

    return () => {
      map.off("click", clusterLayerId, handleClusterClick);
      map.off("click", pointLayerId, handlePointClick);
      map.off("mouseenter", clusterLayerId, setPointer);
      map.off("mouseleave", clusterLayerId, clearPointer);
      map.off("mouseenter", pointLayerId, setPointer);
      map.off("mouseleave", pointLayerId, clearPointer);
    };
  }, [isLoaded, map, sourceId, clusterLayerId, pointLayerId, datasetId, onSelect]);

  return null;
}
