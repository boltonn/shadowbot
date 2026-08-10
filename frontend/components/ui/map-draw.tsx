"use client";

import { useEffect, useRef } from "react";
import type { LineString, Point, Polygon } from "geojson";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawExtend,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
  type HexColor,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { useMap } from "@/components/ui/map";

/** A geometry-producing draw mode. `"select"` is edit-only — it never creates new shapes. */
export type DrawGeometryType = "point" | "linestring" | "polygon" | "rectangle" | "circle";
export type DrawMode = DrawGeometryType | "select";

/**
 * A drawn/uploaded shape, controlled from outside the component. `properties.mode`
 * must match one of the `modes` this MapDraw instance was given — it determines
 * which editing behavior (coordinate drag vs. center/opposite resize) applies.
 * Extra JSON-safe properties (e.g. a caller-defined `session` tag) may be added,
 * which is how a single shared MapDraw instance can multiplex several logical
 * drawing sessions on one map — see the note on `id` (prop, below) for why only
 * one instance should ever be mounted per map.
 *
 * `id` must be a valid UUID4 string for any feature you construct yourself (e.g.
 * from a file upload or a custom draw gesture) — terra-draw's default id strategy
 * silently rejects `addFeatures` calls for ids that aren't (`crypto.randomUUID()`
 * works). Features that came out of this component's own `onChange` already have
 * a valid id and can be echoed straight back through `value`.
 */
export type DrawnFeature<G extends Polygon | LineString | Point = Polygon | LineString | Point> = {
  type: "Feature";
  id: string;
  geometry: G;
  properties: { mode: DrawGeometryType } & Record<string, string | number | boolean | null>;
};

type MapDrawProps<G extends Polygon | LineString | Point> = {
  /**
   * Unique id for this MapDraw instance, used to namespace its map layers/sources.
   * Terra-draw does not support two independent instances bound to the same map —
   * only the first-mounted one reliably receives pointer interaction — so if a map
   * needs more than one logical drawing session (e.g. exclude zones and an area
   * filter), mount a single MapDraw and multiplex sessions via a `properties` tag
   * instead of mounting MapDraw twice.
   */
  id: string;
  /** Which draw modes are instantiated for this session. Pass a stable (module-level or memoized) array. */
  modes: DrawGeometryType[];
  /** Active mode. `"select"` or `null` means edit-only — no new-shape drawing. */
  mode: DrawMode | null;
  /** Controlled set of features that should exist in the draw store. */
  value: DrawnFeature<G>[];
  /** Fires with the full current feature snapshot after any create, edit, or delete. */
  onChange: (features: DrawnFeature<G>[]) => void;
  /** Fires once a new shape finishes drawing (not on edits) — handy for auto-exiting draw mode. */
  onFinish?: () => void;
  /** Fill/outline accent color for drawn and selected shapes, constant or per-feature. */
  color?: HexColor | ((feature: DrawnFeature<G>) => HexColor);
};

type SelectModeOptions = NonNullable<ConstructorParameters<typeof TerraDrawSelectMode>[0]>;
type SelectFlags = NonNullable<SelectModeOptions["flags"]>;

const EDITABLE_COORDINATE_MODES = new Set<DrawGeometryType>(["polygon", "linestring"]);
const RESIZABLE_MODES = new Set<DrawGeometryType>(["circle", "rectangle"]);

function buildSelectFlags(modes: DrawGeometryType[]): SelectFlags {
  const flags: SelectFlags = {};
  for (const mode of modes) {
    if (mode === "point") {
      flags[mode] = { feature: { draggable: true } };
    } else if (RESIZABLE_MODES.has(mode)) {
      flags[mode] = {
        feature: { draggable: true, coordinates: { resizable: "center", deletable: false } },
      };
    } else if (EDITABLE_COORDINATE_MODES.has(mode)) {
      flags[mode] = {
        feature: {
          draggable: true,
          coordinates: { draggable: true, deletable: true, midpoints: { draggable: true } },
        },
      };
    }
  }
  return flags;
}

type ResolvedColor = HexColor | ((feature: GeoJSONStoreFeatures) => HexColor);

function buildModeInstances(modes: DrawGeometryType[], color: ResolvedColor): TerraDrawExtend.TerraDrawBaseDrawMode<TerraDrawExtend.CustomStyling>[] {
  const styles = {
    fillColor: color,
    fillOpacity: 0.15,
    outlineColor: color,
    outlineWidth: 1.5,
    outlineOpacity: 0.9,
  };
  const instances: TerraDrawExtend.TerraDrawBaseDrawMode<TerraDrawExtend.CustomStyling>[] = modes.map((mode) => {
    switch (mode) {
      case "point":
        return new TerraDrawPointMode({ styles: { pointColor: color, pointOutlineColor: color } });
      case "linestring":
        return new TerraDrawLineStringMode({ styles: { lineStringColor: color } });
      case "polygon":
        return new TerraDrawPolygonMode({ styles });
      case "rectangle":
        return new TerraDrawRectangleMode({ styles, drawInteraction: "click-move-or-drag" });
      case "circle":
        return new TerraDrawCircleMode({ styles, drawInteraction: "click-move-or-drag" });
    }
  });
  instances.push(
    new TerraDrawSelectMode({
      flags: buildSelectFlags(modes),
      styles: {
        selectedPolygonColor: color,
        selectedPolygonOutlineColor: color,
        selectedLineStringColor: color,
      },
    }),
  );
  return instances;
}

// Terra-draw's default store rejects (without throwing) any feature whose coordinates
// exceed 9 decimal places — comfortably below GPS accuracy, but well above what
// `map.lngLat`, GeoJSON uploads, or other external sources produce, so any externally
// built feature needs rounding before it's handed to `addFeatures`.
const COORDINATE_PRECISION = 9;

function roundCoordinate([lng, lat]: [number, number]): [number, number] {
  return [Number(lng.toFixed(COORDINATE_PRECISION)), Number(lat.toFixed(COORDINATE_PRECISION))];
}

function roundGeometry<G extends Polygon | LineString | Point>(geometry: G): G {
  if (geometry.type === "Point") {
    return { ...geometry, coordinates: roundCoordinate(geometry.coordinates as [number, number]) };
  }
  if (geometry.type === "LineString") {
    return { ...geometry, coordinates: geometry.coordinates.map((c) => roundCoordinate(c as [number, number])) };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) => ring.map((c) => roundCoordinate(c as [number, number]))),
  };
}

function toStoreFeature(feature: DrawnFeature): GeoJSONStoreFeatures {
  return {
    type: "Feature",
    id: feature.id,
    geometry: roundGeometry(feature.geometry),
    properties: feature.properties,
  };
}

/** addFeatures rejects invalid features (e.g. a non-UUID4 id) without throwing — surface it. */
function addFeaturesLoudly(draw: TerraDraw, features: DrawnFeature[]): void {
  if (features.length === 0) return;
  const results = draw.addFeatures(features.map(toStoreFeature));
  const rejected = results.filter((result) => !result.valid);
  if (rejected.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[MapDraw] addFeatures rejected some features:", rejected);
  }
}

/**
 * Terra-draw's store also holds internal helper features (selection points, midpoints)
 * that render the drag handles while a shape is selected — they carry `properties.mode
 * === "select"` rather than one of this instance's real geometry modes. Filter those out
 * so they never leak into the caller's `value`/`onChange` as phantom shapes.
 */
function getUserFeatures<G extends Polygon | LineString | Point>(
  draw: TerraDraw,
  modes: DrawGeometryType[],
): DrawnFeature<G>[] {
  return draw.getSnapshot().filter((feature) => modes.includes(feature.properties.mode as DrawGeometryType)) as DrawnFeature<G>[];
}

/**
 * Draw or edit Point/LineString/Polygon geometry on the map (freehand shapes, resizable
 * circles/rectangles, and drag-to-reshape editing), backed by terra-draw. Controlled via
 * `value`/`onChange` like the rest of this file's components — consumers own the
 * geometry list, this component only reflects it and reports user-driven changes.
 */
export function MapDraw<G extends Polygon | LineString | Point = Polygon | LineString | Point>({
  id,
  modes,
  mode,
  value,
  onChange,
  onFinish,
  color = "#e5484d",
}: MapDrawProps<G>) {
  const { map, isLoaded } = useMap();
  const drawRef = useRef<TerraDraw | null>(null);
  const callbacksRef = useRef({ onChange, onFinish });
  callbacksRef.current = { onChange, onFinish };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const resolvedColor: ResolvedColor =
    typeof color === "function"
      ? (feature) => (color as (feature: DrawnFeature<G>) => HexColor)(feature as unknown as DrawnFeature<G>)
      : color;

  useEffect(() => {
    if (!isLoaded || !map) return;

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: id }),
      modes: buildModeInstances(modes, resolvedColor),
    });

    draw.start();
    addFeaturesLoudly(draw, value);
    // The separate mode-sync effect below only depends on `mode`, so it never re-fires
    // just because this effect's own dependencies (isLoaded/map) changed — if `mode` was
    // already `null`/constant on the very first render (before `isLoaded` was true), that
    // effect ran once, found no draw instance yet, and will never run again. Set the
    // initial mode here instead, where a real instance is guaranteed to exist.
    draw.setMode(modeRef.current ?? "select");
    drawRef.current = draw;

    const handleChange = () => {
      callbacksRef.current.onChange(getUserFeatures<G>(draw, modes));
    };
    const handleFinish = () => callbacksRef.current.onFinish?.();

    draw.on("change", handleChange);
    draw.on("finish", handleFinish);

    return () => {
      // In dev, React Strict Mode synchronously mounts→cleans up→remounts every
      // effect once; `stop()` can throw if the map's own style/canvas is mid-teardown
      // during that dance (it reaches into the style to remove sources/layers). Letting
      // that exception escape skips `drawRef.current = null` below, which leaves a
      // half-torn-down instance with live DOM listeners behind to conflict with the
      // instance the remount creates — so isolate the failure instead of propagating it.
      try {
        draw.stop();
      } catch {
        // best-effort cleanup, see above
      }
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, id]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const nextMode = mode ?? "select";
    if (draw.getMode() !== nextMode) draw.setMode(nextMode);
  }, [mode]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;

    const currentIds = new Set(getUserFeatures(draw, modes).map((feature) => feature.id));
    const nextIds = new Set(value.map((feature) => feature.id));

    const toAdd = value.filter((feature) => !currentIds.has(feature.id));
    const toRemove = [...currentIds].filter((featureId) => !nextIds.has(featureId));

    addFeaturesLoudly(draw, toAdd);
    if (toRemove.length > 0) draw.removeFeatures(toRemove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return null;
}
