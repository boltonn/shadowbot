"use client";

import { useEffect, useRef, useState } from "react";
import type { Polygon } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { MapGeoJSON, useMap } from "@/components/ui/map";
import { MapDraw, type DrawGeometryType, type DrawMode, type DrawnFeature } from "@/components/ui/map-draw";
import { useMapStore } from "@/features/map/store";
import { bboxPolygon } from "@/lib/geo";

// terra-draw only reliably drives pointer interaction for one mounted instance per map (see
// MapDraw's own doc comment), so this single instance is shared by two independent drawing
// sessions — the rectangle area filter and dataset-polygon creation — multiplexed via each
// feature's `properties.mode`.
const DRAW_MODES: DrawGeometryType[] = ["rectangle", "polygon"];

type Drag = { start: [number, number]; current: [number, number] };

/**
 * The "draw a new rectangle" gesture is handled with plain mousedown/mousemove/mouseup
 * listeners rather than terra-draw's own rectangle draw mode — terra-draw-maplibre-gl-adapter
 * doesn't reliably classify a drag starting on empty map space as a drag (confirmed: driving
 * the mode's onDragStart/onDrag/onDragEnd directly produces a correct feature, but the adapter
 * never calls them from real pointer events). Editing an existing rectangle afterward (drag a
 * corner to resize) goes through terra-draw's select mode instead, which — being a drag that
 * starts on an existing feature's vertex rather than empty space — works correctly.
 *
 * Drawing a new dataset polygon, by contrast, uses terra-draw's own polygon draw mode directly
 * (click to place vertices, double-click/click-first-point to close) — that interaction works
 * fine through the adapter, unlike the rectangle drag gesture.
 */
export function AreaSelectLayer() {
  const { map } = useMap();
  const areaSelectDrawMode = useMapStore((state) => state.areaSelectDrawMode);
  const setAreaSelectDrawMode = useMapStore((state) => state.setAreaSelectDrawMode);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setSelectedArea = useMapStore((state) => state.setSelectedArea);
  const drawFeatureMode = useMapStore((state) => state.drawFeatureMode);
  const pendingFeatureDraft = useMapStore((state) => state.pendingFeatureDraft);
  const setPendingFeatureDraft = useMapStore((state) => state.setPendingFeatureDraft);
  const [drag, setDrag] = useState<Drag | null>(null);
  // setSelectedArea (a Zustand store write) must never happen inside a React state
  // updater function — updaters can run outside the normal commit timing, which is
  // exactly what tripped "Cannot update a component while rendering a different
  // component" here. Track the live drag value in a ref instead, and only call
  // setSelectedArea as a plain top-level statement in the mouseup handler.
  const dragRef = useRef<Drag | null>(null);

  const [polygonDraft, setPolygonDraft] = useState<DrawnFeature<Polygon> | null>(null);
  // MapDraw's onFinish can fire in the same synchronous callback chain as the onChange that
  // just updated the draft, before React re-renders — read this ref there, not the state.
  const polygonDraftRef = useRef<DrawnFeature<Polygon> | null>(null);

  useEffect(() => {
    if (!map || areaSelectDrawMode !== "rectangle") return;

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    const handleMouseDown = (e: MapMouseEvent) => {
      const next = { start: [e.lngLat.lng, e.lngLat.lat] as [number, number], current: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
      dragRef.current = next;
      setDrag(next);
    };
    const handleMouseMove = (e: MapMouseEvent) => {
      if (!dragRef.current) return;
      const next = { ...dragRef.current, current: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
      dragRef.current = next;
      setDrag(next);
    };
    const handleMouseUp = (e: MapMouseEvent) => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setAreaSelectDrawMode(null);
      if (current) {
        setSelectedArea({
          type: "Feature",
          // terra-draw's default id strategy only accepts UUID4 ids — an arbitrary
          // string here gets silently rejected by MapDraw's addFeatures call below.
          id: crypto.randomUUID(),
          geometry: bboxPolygon(current.start, [e.lngLat.lng, e.lngLat.lat]),
          properties: { mode: "rectangle" },
        });
      }
    };

    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", handleMouseUp);

    return () => {
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", handleMouseUp);
      dragRef.current = null;
      setDrag(null);
    };
  }, [map, areaSelectDrawMode, setAreaSelectDrawMode, setSelectedArea]);

  const preview = drag ? bboxPolygon(drag.start, drag.current) : null;
  const isDrawingPolygon = drawFeatureMode?.kind === "polygon" && !pendingFeatureDraft;
  const mode: DrawMode | null = areaSelectDrawMode === "rectangle" ? "rectangle" : isDrawingPolygon ? "polygon" : null;
  // Once the polygon draft has been handed off (saved or cancelled) or drawing was aborted, stop
  // including it — MapDraw's own value-sync effect then removes it from the draw store for us.
  const visiblePolygonDraft = drawFeatureMode?.kind === "polygon" ? polygonDraft : null;

  return (
    <>
      {/* Live drag preview — plain, non-interactive, redrawn every mousemove. */}
      {preview && (
        <MapGeoJSON
          id="area-select-preview"
          data={preview}
          fillPaint={{ "fill-color": "#38bdf8", "fill-opacity": 0.12 }}
          linePaint={{ "line-color": "#38bdf8", "line-width": 1.5 }}
        />
      )}
      {/* The committed area (+ any in-progress dataset polygon draft), editable via terra-draw's select mode. */}
      <MapDraw<Polygon>
        id="area-select"
        modes={DRAW_MODES}
        mode={mode}
        value={[...(selectedArea ? [selectedArea] : []), ...(visiblePolygonDraft ? [visiblePolygonDraft] : [])]}
        onChange={(features) => {
          setSelectedArea(features.find((feature) => feature.properties.mode === "rectangle") ?? null);
          const nextPolygonDraft = features.find((feature) => feature.properties.mode === "polygon") ?? null;
          polygonDraftRef.current = nextPolygonDraft;
          setPolygonDraft(nextPolygonDraft);
        }}
        onFinish={() => {
          // Only the dataset-polygon session drives terra-draw's own draw interaction — the
          // rectangle gesture above is handled manually and never triggers this callback.
          const finished = polygonDraftRef.current;
          if (finished && drawFeatureMode?.kind === "polygon") {
            setPendingFeatureDraft({ datasetId: drawFeatureMode.datasetId, kind: "polygon", geometry: finished.geometry });
          }
        }}
        color={isDrawingPolygon || pendingFeatureDraft?.kind === "polygon" ? "#4fd1c5" : "#38bdf8"}
      />
    </>
  );
}
