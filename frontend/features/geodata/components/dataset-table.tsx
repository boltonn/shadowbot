"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBulkTagFeatures } from "@/features/geodata/hooks/use-bulk-tag-features";
import { useLabelFeature, useLabelTrackPoint } from "@/features/geodata/hooks/use-label-feature";
import type { DatasetDetail, PointFeature, PolygonFeature, TrackPoint } from "@/features/geodata/types";

type Row = { id: string; cells: React.ReactNode[]; tags: string[] };

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** A minimal, uncontrolled text cell that only fires onCommit when the value actually changes. */
function EditableCell({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      className="w-full min-w-0 border-none bg-transparent px-1 py-0.5 text-xs outline-none focus:bg-muted/50"
    />
  );
}

function useRowBuilders(dataset: DatasetDetail) {
  const labelFeature = useLabelFeature(dataset.geometryKind === "polygon" ? "polygon" : "point");
  const labelTrackPoint = useLabelTrackPoint();

  if (dataset.geometryKind === "point" || dataset.geometryKind === "polygon") {
    const features = (dataset.geometryKind === "point" ? dataset.points : dataset.polygons) as (
      | PointFeature
      | PolygonFeature
    )[];
    const columns = ["Name", "Category", "Tags", "Location"];
    const rows: Row[] = features.map((feature) => {
      const [longitude, latitude] =
        feature.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : (feature.geometry.coordinates[0][0] as [number, number]);
      return {
        id: feature.id,
        tags: feature.tags,
        cells: [
          <EditableCell
            key="name"
            value={feature.name ?? ""}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: feature.id,
                body: { category: feature.category, name: next || null, tags: feature.tags },
              })
            }
          />,
          <EditableCell
            key="category"
            value={feature.category}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: feature.id,
                body: { category: next, name: feature.name, tags: feature.tags },
              })
            }
          />,
          <EditableCell
            key="tags"
            value={feature.tags.join(", ")}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: feature.id,
                body: { category: feature.category, name: feature.name, tags: parseTags(next) },
              })
            }
          />,
          <span key="location" className="font-mono text-[10px] text-muted-foreground">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>,
        ],
      };
    });
    return { columns, rows };
  }

  const points = dataset.points as TrackPoint[];
  const columns = ["Recorded", "Elevation (m)", "Speed (m/s)", "Tags", "Location"];
  const rows: Row[] = points.map((point) => {
    const [longitude, latitude] = point.geometry.coordinates as [number, number];
    return {
      id: point.id,
      tags: point.tags,
      cells: [
        <span key="recorded" className="text-xs">{new Date(point.dateRecorded).toLocaleString()}</span>,
        <span key="elevation" className="text-xs">{point.elevationM?.toFixed(1) ?? "--"}</span>,
        <span key="speed" className="text-xs">{point.speedMps?.toFixed(1) ?? "--"}</span>,
        <EditableCell
          key="tags"
          value={point.tags.join(", ")}
          onCommit={(next) =>
            labelTrackPoint.mutate({ trackId: dataset.id, pointId: point.id, body: { tags: parseTags(next) } })
          }
        />,
        <span key="location" className="font-mono text-[10px] text-muted-foreground">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>,
      ],
    };
  });
  return { columns, rows };
}

export function DatasetTable({ dataset }: { dataset: DatasetDetail }) {
  const { columns, rows } = useRowBuilders(dataset);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const bulkTag = useBulkTagFeatures(dataset.geometryKind);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkTag = (mode: "add" | "remove") => {
    const tag = bulkTagInput.trim();
    if (!tag || selectedIds.size === 0) return;
    bulkTag.mutate({
      datasetId: dataset.id,
      body: { featureIds: Array.from(selectedIds), addTags: mode === "add" ? [tag] : [], removeTags: mode === "remove" ? [tag] : [] },
    });
    setBulkTagInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="size-3 text-muted-foreground" />
          {allTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <Input
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            placeholder="tag name"
            className="h-7 max-w-40 text-xs"
          />
          <Button type="button" size="xs" variant="outline" onClick={() => applyBulkTag("add")}>
            Add tag
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => applyBulkTag("remove")}>
            Remove tag
          </Button>
        </div>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-sm border border-border">
        <table className="w-full border-collapse text-left" style={{ display: "block" }}>
          <thead className="sticky top-0 z-10 block bg-popover">
            <tr className="flex items-center">
              <th className="w-8 shrink-0 border-b border-border px-2 py-1.5" />
              {columns.map((column) => (
                <th
                  key={column}
                  className="min-w-0 flex-1 border-b border-border px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ height: virtualizer.getTotalSize(), position: "relative", display: "block" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center border-b border-border last:border-b-0"
                >
                  <td className="flex w-8 shrink-0 justify-center px-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      className="accent-foreground"
                    />
                  </td>
                  {row.cells.map((cell, index) => (
                    <td key={index} className="min-w-0 flex-1 px-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
