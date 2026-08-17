"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MapPopup, useMap } from "@/components/ui/map";
import { useDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import { useLabelFeature, useLabelTrackPoint } from "@/features/geodata/hooks/use-label-feature";
import { polygonCentroid } from "@/lib/geo";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** A minimal, uncontrolled text field that only commits when the value actually changes. */
function EditableField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
      <input
        key={value}
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        className="w-full min-w-0 rounded-sm border border-input bg-transparent px-1.5 py-1 text-xs outline-none focus:border-ring"
      />
    </label>
  );
}

function RawProperties({ properties }: { properties: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(properties);
  if (keys.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        Raw data ({keys.length})
      </button>
      {open && (
        <pre className="max-h-40 overflow-auto rounded-sm border border-border bg-muted/20 p-1.5 text-[10px] whitespace-pre-wrap">
          {JSON.stringify(properties, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function FeatureInspector() {
  const { map } = useMap();
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const { data } = useDatasetDetail(selectedFeature?.datasetId ?? "", selectedFeature !== null);
  const labelPointFeature = useLabelFeature("point");
  const labelPolygonFeature = useLabelFeature("polygon");
  const labelTrackPoint = useLabelTrackPoint();

  const resolved = useMemo(() => {
    if (!data || !selectedFeature) return null;
    if (data.geometryKind === "point") {
      const feature = data.points.find((point) => point.id === selectedFeature.featureId);
      if (!feature) return null;
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      return { kind: "point" as const, feature, longitude, latitude };
    }
    if (data.geometryKind === "polygon") {
      const feature = data.polygons.find((polygon) => polygon.id === selectedFeature.featureId);
      if (!feature) return null;
      const [longitude, latitude] = polygonCentroid(feature.geometry);
      return { kind: "polygon" as const, feature, longitude, latitude };
    }
    const feature = data.points.find((point) => point.id === selectedFeature.featureId);
    if (!feature) return null;
    const [longitude, latitude] = feature.geometry.coordinates as [number, number];
    return { kind: "track" as const, feature, longitude, latitude, trackId: data.id };
  }, [data, selectedFeature]);

  // Selecting a feature from the data view (where the map isn't visible) should still bring
  // it into view once the map renders it — center without touching zoom, so this stays gentle
  // for a feature the user just clicked directly on the map too.
  useEffect(() => {
    if (!map || !resolved) return;
    map.easeTo({ center: [resolved.longitude, resolved.latitude], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, resolved?.longitude, resolved?.latitude]);

  if (!selectedFeature || !resolved) return null;

  const { datasetId } = selectedFeature;

  return (
    <MapPopup
      longitude={resolved.longitude}
      latitude={resolved.latitude}
      onClose={() => setSelectedFeature(null)}
      closeButton
    >
      <div className="flex w-56 flex-col gap-2">
        {resolved.kind === "track" ? (
          <>
            <p className="text-xs text-muted-foreground">{new Date(resolved.feature.dateRecorded).toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">
              {resolved.feature.elevationM !== null ? `${resolved.feature.elevationM.toFixed(1)} m` : "--"}
              {" · "}
              {resolved.feature.speedMps !== null ? `${resolved.feature.speedMps.toFixed(1)} m/s` : "--"}
            </p>
            <EditableField
              label="Tags"
              value={resolved.feature.tags.join(", ")}
              onCommit={(next) =>
                labelTrackPoint.mutate({
                  trackId: resolved.trackId,
                  pointId: resolved.feature.id,
                  body: { tags: parseTags(next) },
                })
              }
            />
          </>
        ) : (
          <>
            <EditableField
              label="Name"
              value={resolved.feature.name ?? ""}
              onCommit={(next) =>
                (resolved.kind === "point" ? labelPointFeature : labelPolygonFeature).mutate({
                  datasetId,
                  featureId: resolved.feature.id,
                  body: { category: resolved.feature.category, name: next || null, tags: resolved.feature.tags },
                })
              }
            />
            <EditableField
              label="Category"
              value={resolved.feature.category}
              onCommit={(next) =>
                (resolved.kind === "point" ? labelPointFeature : labelPolygonFeature).mutate({
                  datasetId,
                  featureId: resolved.feature.id,
                  body: { category: next, name: resolved.feature.name || null, tags: resolved.feature.tags },
                })
              }
            />
            <EditableField
              label="Tags"
              value={resolved.feature.tags.join(", ")}
              onCommit={(next) =>
                (resolved.kind === "point" ? labelPointFeature : labelPolygonFeature).mutate({
                  datasetId,
                  featureId: resolved.feature.id,
                  body: { category: resolved.feature.category, name: resolved.feature.name || null, tags: parseTags(next) },
                })
              }
            />
            {resolved.kind === "point" && <RawProperties properties={resolved.feature.properties} />}
          </>
        )}
      </div>
    </MapPopup>
  );
}
