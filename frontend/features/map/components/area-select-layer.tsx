"use client";

import { useEffect, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import { MapGeoJSON, useMap } from "@/components/ui/map";
import { useMapStore } from "@/features/map/store";
import { bboxPolygon } from "@/lib/geo";

type Drag = { start: [number, number]; current: [number, number] };

export function AreaSelectLayer() {
  const { map } = useMap();
  const isAreaSelectMode = useMapStore((state) => state.isAreaSelectMode);
  const setAreaSelectMode = useMapStore((state) => state.setAreaSelectMode);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setSelectedArea = useMapStore((state) => state.setSelectedArea);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    if (!map || !isAreaSelectMode) return;

    // Dragging draws a rectangle instead of panning the map while active.
    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    const handleMouseDown = (e: MapMouseEvent) => {
      setDrag({ start: [e.lngLat.lng, e.lngLat.lat], current: [e.lngLat.lng, e.lngLat.lat] });
    };
    const handleMouseMove = (e: MapMouseEvent) => {
      setDrag((current) => (current ? { ...current, current: [e.lngLat.lng, e.lngLat.lat] } : current));
    };
    const handleMouseUp = (e: MapMouseEvent) => {
      setDrag((current) => {
        if (current) {
          setSelectedArea(bboxPolygon(current.start, [e.lngLat.lng, e.lngLat.lat]));
        }
        return null;
      });
      setAreaSelectMode(false);
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
      setDrag(null);
    };
  }, [map, isAreaSelectMode, setAreaSelectMode, setSelectedArea]);

  const preview = drag ? bboxPolygon(drag.start, drag.current) : null;
  const shown = preview ?? selectedArea;

  if (!shown) return null;

  return (
    <MapGeoJSON
      id="area-select"
      data={shown}
      fillPaint={{ "fill-color": "#38bdf8", "fill-opacity": 0.12 }}
      linePaint={{ "line-color": "#38bdf8", "line-width": 1.5 }}
    />
  );
}
