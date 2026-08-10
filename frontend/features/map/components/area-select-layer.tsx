"use client";

import { useEffect, useRef, useState } from "react";
import type { Polygon } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { MapGeoJSON, useMap } from "@/components/ui/map";
import { MapDraw, type DrawGeometryType } from "@/components/ui/map-draw";
import { useMapStore } from "@/features/map/store";
import { bboxPolygon } from "@/lib/geo";

// Only used so terra-draw's select mode knows how to configure resize flags for
// `properties.mode: "rectangle"` features — `mode` passed to MapDraw below never
// activates draw-mode "rectangle" itself (see the file doc comment for why).
const EDITABLE_MODES: DrawGeometryType[] = ["rectangle"];

type Drag = { start: [number, number]; current: [number, number] };

/**
 * The "draw a new rectangle" gesture is handled with plain mousedown/mousemove/mouseup
 * listeners rather than terra-draw's own rectangle draw mode — terra-draw-maplibre-gl-adapter
 * doesn't reliably classify a drag starting on empty map space as a drag (confirmed: driving
 * the mode's onDragStart/onDrag/onDragEnd directly produces a correct feature, but the adapter
 * never calls them from real pointer events). Editing an existing rectangle afterward (drag a
 * corner to resize) goes through terra-draw's select mode instead, which — being a drag that
 * starts on an existing feature's vertex rather than empty space — works correctly.
 */
export function AreaSelectLayer() {
  const { map } = useMap();
  const areaSelectDrawMode = useMapStore((state) => state.areaSelectDrawMode);
  const setAreaSelectDrawMode = useMapStore((state) => state.setAreaSelectDrawMode);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setSelectedArea = useMapStore((state) => state.setSelectedArea);
  const [drag, setDrag] = useState<Drag | null>(null);
  // setSelectedArea (a Zustand store write) must never happen inside a React state
  // updater function — updaters can run outside the normal commit timing, which is
  // exactly what tripped "Cannot update a component while rendering a different
  // component" here. Track the live drag value in a ref instead, and only call
  // setSelectedArea as a plain top-level statement in the mouseup handler.
  const dragRef = useRef<Drag | null>(null);

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
      {/* The committed area, rendered + drag-to-resize editable via terra-draw's select mode. */}
      <MapDraw<Polygon>
        id="area-select"
        modes={EDITABLE_MODES}
        mode={null}
        value={selectedArea ? [selectedArea] : []}
        onChange={(features) => setSelectedArea(features.at(-1) ?? null)}
        color="#38bdf8"
      />
    </>
  );
}
