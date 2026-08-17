"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Table as ReactTableInstance,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBulkTagFeatures } from "@/features/geodata/hooks/use-bulk-tag-features";
import { useLabelFeature, useLabelTrackPoint } from "@/features/geodata/hooks/use-label-feature";
import type { DatasetDetail, PointFeature, PolygonFeature } from "@/features/geodata/types";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

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

type ColumnMeta = { numeric?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const numberRangeFilter: FilterFn<any> = (row, columnId, filterValue) => {
  const [min, max] = (filterValue as [string, string]) ?? ["", ""];
  const value = row.getValue(columnId);
  if (typeof value !== "number") return false;
  if (min !== "" && value < Number(min)) return false;
  if (max !== "" && value > Number(max)) return false;
  return true;
};

function ColumnFilterInput<TData>({ column }: { column: Column<TData, unknown> }) {
  const isNumeric = (column.columnDef.meta as ColumnMeta | undefined)?.numeric;

  if (isNumeric) {
    const [min, max] = (column.getFilterValue() as [string, string] | undefined) ?? ["", ""];
    return (
      <div className="mt-1 flex gap-1">
        <input
          value={min}
          onChange={(e) => column.setFilterValue([e.target.value, max])}
          placeholder="min"
          className="w-1/2 min-w-0 rounded-sm border border-input bg-transparent px-1 py-0.5 text-[10px] normal-case outline-none focus:border-ring"
        />
        <input
          value={max}
          onChange={(e) => column.setFilterValue([min, e.target.value])}
          placeholder="max"
          className="w-1/2 min-w-0 rounded-sm border border-input bg-transparent px-1 py-0.5 text-[10px] normal-case outline-none focus:border-ring"
        />
      </div>
    );
  }

  return (
    <input
      value={(column.getFilterValue() as string) ?? ""}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="filter..."
      className="mt-1 w-full min-w-0 rounded-sm border border-input bg-transparent px-1 py-0.5 text-[10px] normal-case outline-none focus:border-ring"
    />
  );
}

/** Shared virtualized rendering for both feature and track tables — columns/data/filters differ, layout doesn't. */
function VirtualizedTable<TData>({
  table,
  selectedIds,
  toggleRow,
  inspectedId,
  onInspect,
}: {
  table: ReactTableInstance<TData>;
  selectedIds: Set<string>;
  toggleRow: (id: string) => void;
  inspectedId: string | null;
  onInspect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-sm border border-border">
      <table className="w-full border-collapse text-left" style={{ display: "block" }}>
        <thead className="sticky top-0 z-10 block bg-popover">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="flex items-start">
              <th className="w-8 shrink-0 border-b border-border px-2 py-1.5" />
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="min-w-0 flex-1 border-b border-border px-2 py-1.5">
                  <div className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                  {header.column.getCanFilter() && <ColumnFilterInput column={header.column} />}
                </th>
              ))}
            </tr>
          ))}
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
                className={cn(
                  "flex cursor-pointer items-center border-b border-border last:border-b-0 hover:bg-muted/30",
                  inspectedId === row.id && "bg-signal/10",
                )}
                onClick={() => onInspect(row.id)}
              >
                <td className="flex w-8 shrink-0 justify-center px-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="accent-foreground"
                  />
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="min-w-0 flex-1 px-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableToolbar({
  allTags,
  selectedIds,
  bulkTagInput,
  setBulkTagInput,
  onApply,
}: {
  allTags: string[];
  selectedIds: Set<string>;
  bulkTagInput: string;
  setBulkTagInput: (value: string) => void;
  onApply: (mode: "add" | "remove") => void;
}) {
  return (
    <>
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
          <Button type="button" size="xs" variant="outline" onClick={() => onApply("add")}>
            Add tag
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => onApply("remove")}>
            Remove tag
          </Button>
        </div>
      )}
    </>
  );
}

function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return { selectedIds, toggleRow };
}

type FeatureRow = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  latitude: number;
  longitude: number;
  properties: Record<string, unknown>;
};

function isNumericColumn(rows: FeatureRow[], key: string): boolean {
  let sawValue = false;
  for (const row of rows) {
    const value = row.properties[key];
    if (value === null || value === undefined) continue;
    sawValue = true;
    if (typeof value !== "number") return false;
  }
  return sawValue;
}

/** Selecting a row also brings its dataset onto the map, if it isn't shown there already. */
function useInspectRow(datasetId: string) {
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);
  const toggleDatasetVisibility = useMapStore((state) => state.toggleDatasetVisibility);

  const inspectedId = selectedFeature?.datasetId === datasetId ? selectedFeature.featureId : null;
  const onInspect = (featureId: string) => {
    setSelectedFeature({ datasetId, featureId });
    if (!visibleDatasetIds.includes(datasetId)) toggleDatasetVisibility(datasetId);
  };
  return { inspectedId, onInspect };
}

function FeaturesTable({ dataset }: { dataset: Extract<DatasetDetail, { geometryKind: "point" | "polygon" }> }) {
  const labelFeature = useLabelFeature(dataset.geometryKind === "polygon" ? "polygon" : "point");
  const bulkTag = useBulkTagFeatures(dataset.geometryKind);
  const setFilteredFeatureIds = useMapStore((state) => state.setFilteredFeatureIds);
  const { inspectedId, onInspect } = useInspectRow(dataset.id);

  const features = (dataset.geometryKind === "point" ? dataset.points : dataset.polygons) as (
    | PointFeature
    | PolygonFeature
  )[];

  const rows = useMemo<FeatureRow[]>(
    () =>
      features.map((feature) => {
        const [longitude, latitude] =
          feature.geometry.type === "Point"
            ? (feature.geometry.coordinates as [number, number])
            : (feature.geometry.coordinates[0][0] as [number, number]);
        return {
          id: feature.id,
          name: feature.name ?? "",
          category: feature.category,
          tags: feature.tags,
          latitude,
          longitude,
          properties: "properties" in feature ? feature.properties : {},
        };
      }),
    [features],
  );

  const propertyKeys = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((row) => Object.keys(row.properties).forEach((key) => keys.add(key)));
    return Array.from(keys).sort();
  }, [rows]);

  const columns = useMemo<ColumnDef<FeatureRow>[]>(() => {
    const fixed: ColumnDef<FeatureRow>[] = [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => row.name,
        filterFn: "includesString",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.name}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: row.original.id,
                body: { category: row.original.category, name: next || null, tags: row.original.tags },
              })
            }
          />
        ),
      },
      {
        id: "category",
        header: "Category",
        accessorFn: (row) => row.category,
        filterFn: "includesString",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.category}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: row.original.id,
                body: { category: next, name: row.original.name || null, tags: row.original.tags },
              })
            }
          />
        ),
      },
      {
        id: "tags",
        header: "Tags",
        accessorFn: (row) => row.tags.join(", "),
        filterFn: "includesString",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.tags.join(", ")}
            onCommit={(next) =>
              labelFeature.mutate({
                datasetId: dataset.id,
                featureId: row.original.id,
                body: { category: row.original.category, name: row.original.name || null, tags: parseTags(next) },
              })
            }
          />
        ),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (row) => `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`,
        enableColumnFilter: false,
        cell: ({ getValue }) => (
          <span className="font-mono text-[10px] text-muted-foreground">{getValue<string>()}</span>
        ),
      },
    ];

    const dynamic: ColumnDef<FeatureRow>[] = propertyKeys.map((key) => {
      const numeric = isNumericColumn(rows, key);
      return {
        id: `prop:${key}`,
        header: key,
        accessorFn: (row) => row.properties[key],
        filterFn: numeric ? numberRangeFilter : "includesString",
        meta: { numeric } satisfies ColumnMeta,
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <span className="text-xs text-muted-foreground">
              {value === null || value === undefined ? "--" : String(value)}
            </span>
          );
        },
      };
    });

    return [...fixed, ...dynamic];
  }, [dataset.id, labelFeature, propertyKeys, rows]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const { selectedIds, toggleRow } = useSelection();
  const [bulkTagInput, setBulkTagInput] = useState("");

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  });

  const filteredIds = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.id),
    // table is recreated every render but always reflects current rows/columnFilters,
    // so it's intentionally omitted here to avoid recomputing on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, columnFilters],
  );

  useEffect(() => {
    setFilteredFeatureIds(dataset.id, columnFilters.length > 0 ? new Set(filteredIds) : null);
    return () => setFilteredFeatureIds(dataset.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id, columnFilters.length, filteredIds]);

  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);

  const applyBulkTag = (mode: "add" | "remove") => {
    const tag = bulkTagInput.trim();
    if (!tag || selectedIds.size === 0) return;
    bulkTag.mutate({
      datasetId: dataset.id,
      body: {
        featureIds: Array.from(selectedIds),
        addTags: mode === "add" ? [tag] : [],
        removeTags: mode === "remove" ? [tag] : [],
      },
    });
    setBulkTagInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <TableToolbar
        allTags={allTags}
        selectedIds={selectedIds}
        bulkTagInput={bulkTagInput}
        setBulkTagInput={setBulkTagInput}
        onApply={applyBulkTag}
      />
      <VirtualizedTable
        table={table}
        selectedIds={selectedIds}
        toggleRow={toggleRow}
        inspectedId={inspectedId}
        onInspect={onInspect}
      />
    </div>
  );
}

type TrackRow = {
  id: string;
  dateRecorded: string;
  elevationM: number | null;
  speedMps: number | null;
  tags: string[];
  latitude: number;
  longitude: number;
};

function TrackTable({ dataset }: { dataset: Extract<DatasetDetail, { geometryKind: "track" }> }) {
  const labelTrackPoint = useLabelTrackPoint();
  const bulkTag = useBulkTagFeatures("track");
  const setFilteredFeatureIds = useMapStore((state) => state.setFilteredFeatureIds);
  const { inspectedId, onInspect } = useInspectRow(dataset.id);

  const rows = useMemo<TrackRow[]>(
    () =>
      dataset.points.map((point) => {
        const [longitude, latitude] = point.geometry.coordinates as [number, number];
        return {
          id: point.id,
          dateRecorded: point.dateRecorded,
          elevationM: point.elevationM,
          speedMps: point.speedMps,
          tags: point.tags,
          latitude,
          longitude,
        };
      }),
    [dataset.points],
  );

  const columns = useMemo<ColumnDef<TrackRow>[]>(
    () => [
      {
        id: "recorded",
        header: "Recorded",
        accessorFn: (row) => new Date(row.dateRecorded).toLocaleString(),
        filterFn: "includesString",
        cell: ({ getValue }) => <span className="text-xs">{getValue<string>()}</span>,
      },
      {
        id: "elevation",
        header: "Elevation (m)",
        accessorFn: (row) => row.elevationM,
        filterFn: numberRangeFilter,
        meta: { numeric: true } satisfies ColumnMeta,
        cell: ({ getValue }) => <span className="text-xs">{getValue<number | null>()?.toFixed(1) ?? "--"}</span>,
      },
      {
        id: "speed",
        header: "Speed (m/s)",
        accessorFn: (row) => row.speedMps,
        filterFn: numberRangeFilter,
        meta: { numeric: true } satisfies ColumnMeta,
        cell: ({ getValue }) => <span className="text-xs">{getValue<number | null>()?.toFixed(1) ?? "--"}</span>,
      },
      {
        id: "tags",
        header: "Tags",
        accessorFn: (row) => row.tags.join(", "),
        filterFn: "includesString",
        cell: ({ row }) => (
          <EditableCell
            value={row.original.tags.join(", ")}
            onCommit={(next) =>
              labelTrackPoint.mutate({
                trackId: dataset.id,
                pointId: row.original.id,
                body: { tags: parseTags(next) },
              })
            }
          />
        ),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (row) => `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`,
        enableColumnFilter: false,
        cell: ({ getValue }) => (
          <span className="font-mono text-[10px] text-muted-foreground">{getValue<string>()}</span>
        ),
      },
    ],
    [dataset.id, labelTrackPoint],
  );

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const { selectedIds, toggleRow } = useSelection();
  const [bulkTagInput, setBulkTagInput] = useState("");

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  });

  const filteredIds = useMemo(
    () => table.getFilteredRowModel().rows.map((row) => row.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, columnFilters],
  );

  useEffect(() => {
    setFilteredFeatureIds(dataset.id, columnFilters.length > 0 ? new Set(filteredIds) : null);
    return () => setFilteredFeatureIds(dataset.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id, columnFilters.length, filteredIds]);

  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);

  const applyBulkTag = (mode: "add" | "remove") => {
    const tag = bulkTagInput.trim();
    if (!tag || selectedIds.size === 0) return;
    bulkTag.mutate({
      datasetId: dataset.id,
      body: {
        featureIds: Array.from(selectedIds),
        addTags: mode === "add" ? [tag] : [],
        removeTags: mode === "remove" ? [tag] : [],
      },
    });
    setBulkTagInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <TableToolbar
        allTags={allTags}
        selectedIds={selectedIds}
        bulkTagInput={bulkTagInput}
        setBulkTagInput={setBulkTagInput}
        onApply={applyBulkTag}
      />
      <VirtualizedTable
        table={table}
        selectedIds={selectedIds}
        toggleRow={toggleRow}
        inspectedId={inspectedId}
        onInspect={onInspect}
      />
    </div>
  );
}

export function DatasetTable({ dataset }: { dataset: DatasetDetail }) {
  if (dataset.geometryKind === "track") return <TrackTable dataset={dataset} />;
  return <FeaturesTable dataset={dataset} />;
}
