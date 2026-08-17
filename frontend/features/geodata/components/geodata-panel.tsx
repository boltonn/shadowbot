"use client";

import { Suspense, useState } from "react";
import {
  ChevronRight,
  Download,
  MapIcon,
  PenTool,
  Plus,
  Route as RouteIcon,
  Shapes,
  Square,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDropzone, POINT_UPLOAD_ACCEPT } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatasetTable } from "@/features/geodata/components/dataset-table";
import { TrackTimeSlider } from "@/features/geodata/components/track-time-slider";
import { useDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import { useDatasets } from "@/features/geodata/hooks/use-datasets";
import { useDownloadDataset } from "@/features/geodata/hooks/use-download-dataset";
import { usePreviewTabularPoints } from "@/features/geodata/hooks/use-preview-tabular-points";
import { useUploadPointDataset } from "@/features/geodata/hooks/use-upload-point-dataset";
import { useUploadPolygonDataset } from "@/features/geodata/hooks/use-upload-polygon-dataset";
import { useUploadTrack } from "@/features/geodata/hooks/use-upload-track";
import { CategoryDot } from "@/features/geodata/components/category-dot";
import { LiveResultsPanel } from "@/features/geodata/components/live-results-panel";
import { KNOWN_CATEGORIES } from "@/features/geodata/lib/category-icons";
import type { Dataset, DatasetGeometryKind, TabularPreview } from "@/features/geodata/types";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

const TABULAR_EXTENSIONS = [".csv", ".xlsx"];

function isTabularFile(file: File): boolean {
  return TABULAR_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function guessField(columns: string[], pattern: RegExp): string {
  return columns.find((column) => pattern.test(column)) ?? columns[0] ?? "";
}

const KIND_ICONS: Record<DatasetGeometryKind, typeof RouteIcon> = {
  track: RouteIcon,
  point: MapIcon,
  polygon: Shapes,
};

function formatDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{children}</span>
  );
}

function AreaSelectToolbar() {
  const areaSelectDrawMode = useMapStore((state) => state.areaSelectDrawMode);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setAreaSelectDrawMode = useMapStore((state) => state.setAreaSelectDrawMode);
  const setSelectedArea = useMapStore((state) => state.setSelectedArea);
  const isDrawing = areaSelectDrawMode === "rectangle";

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">Area filter</span>
      <div className="flex gap-1.5">
        {selectedArea && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => setSelectedArea(null)}
            aria-label="Clear area filter"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant={isDrawing ? "default" : "outline"}
          size="sm"
          className="rounded-none"
          onClick={() => setAreaSelectDrawMode(isDrawing ? null : "rectangle")}
        >
          <Square className="size-3.5" />
          {isDrawing ? "Click + drag..." : selectedArea ? "Redraw area" : "Draw area"}
        </Button>
      </div>
    </div>
  );
}

type CategorySource = { typeField: string } | { defaultType: string };

function CategoryChip({
  category,
  selected,
  onSelect,
}: {
  category: string;
  selected: boolean;
  onSelect: (category: string) => void;
}) {
  return (
    <Badge
      variant="outline"
      render={<button type="button" onClick={() => onSelect(category)} />}
      className={cn("gap-1.5 text-[10px]", selected ? "border-ring text-foreground" : "text-muted-foreground")}
    >
      <CategoryDot category={category} />
      {category}
    </Badge>
  );
}

function CategoryUploadFields({
  categoryMode,
  setCategoryMode,
  typeField,
  setTypeField,
  defaultType,
  setDefaultType,
}: {
  categoryMode: "field" | "single";
  setCategoryMode: (mode: "field" | "single") => void;
  typeField: string;
  setTypeField: (value: string) => void;
  defaultType: string;
  setDefaultType: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        Categorize (optional — defaults to a &quot;type&quot; property)
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        <Tabs value={categoryMode} onValueChange={(value) => setCategoryMode(value as "field" | "single")}>
          <TabsList className="w-full">
            <TabsTrigger value="field" className="flex-1 text-xs">From file property</TabsTrigger>
            <TabsTrigger value="single" className="flex-1 text-xs">Single type</TabsTrigger>
          </TabsList>
          <TabsContent value="field" className="mt-2">
            <Input
              value={typeField}
              onChange={(e) => setTypeField(e.target.value)}
              placeholder="Property name (e.g. type)"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Reads each feature&apos;s category from this property in the file, so one upload can mix categories.
            </p>
          </TabsContent>
          <TabsContent value="single" className="mt-2">
            <Input
              value={defaultType}
              onChange={(e) => setDefaultType(e.target.value)}
              placeholder="Category for every feature"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KNOWN_CATEGORIES.map((category) => (
                <CategoryChip
                  key={category}
                  category={category}
                  selected={defaultType === category}
                  onSelect={setDefaultType}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TrackUploadForm() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const uploadTrack = useUploadTrack();

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    uploadTrack.mutate(
      { name: name.trim(), file },
      { onSuccess: () => { setName(""); setFile(null); } },
    );
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={handleUpload}>
      <SectionLabel>Upload track</SectionLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Track name" />
      <FileDropzone file={file} onSelect={setFile} />
      <Button type="submit" disabled={uploadTrack.isPending || !name.trim() || !file}>
        <Upload className="size-3.5" />
        Upload GeoJSON
      </Button>
      {uploadTrack.isError && (
        <p className="text-xs text-destructive">Upload failed — check the file is valid GeoJSON.</p>
      )}
    </form>
  );
}

function CategorizedUploadForm({
  label,
  upload,
}: {
  label: string;
  upload: ReturnType<typeof useUploadPointDataset> | ReturnType<typeof useUploadPolygonDataset>;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [categoryMode, setCategoryMode] = useState<"field" | "single">("field");
  const [typeField, setTypeField] = useState("type");
  const [defaultType, setDefaultType] = useState("");

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    const categorySource: CategorySource =
      categoryMode === "field" ? { typeField: typeField.trim() || "type" } : { defaultType: defaultType.trim() };
    if (categoryMode === "single" && !("defaultType" in categorySource && categorySource.defaultType)) return;

    upload.mutate(
      { name: name.trim(), file, categorySource },
      { onSuccess: () => { setName(""); setFile(null); setDefaultType(""); } },
    );
  };

  const canSubmit = Boolean(name.trim() && file && (categoryMode === "field" || defaultType.trim()));

  return (
    <form className="flex flex-col gap-2" onSubmit={handleUpload}>
      <SectionLabel>{label}</SectionLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />
      <FileDropzone file={file} onSelect={setFile} />
      <CategoryUploadFields
        categoryMode={categoryMode}
        setCategoryMode={setCategoryMode}
        typeField={typeField}
        setTypeField={setTypeField}
        defaultType={defaultType}
        setDefaultType={setDefaultType}
      />
      <Button type="submit" disabled={upload.isPending || !canSubmit}>
        <Upload className="size-3.5" />
        Upload GeoJSON
      </Button>
      {upload.isError && (
        <p className="text-xs text-destructive">Upload failed — check the file and category settings.</p>
      )}
    </form>
  );
}

function TabularColumnMappingFields({
  preview,
  latField,
  setLatField,
  lonField,
  setLonField,
}: {
  preview: TabularPreview;
  latField: string;
  setLatField: (value: string) => void;
  lonField: string;
  setLonField: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-input bg-muted/20 p-2.5">
      <p className="text-[11px] text-muted-foreground">
        {preview.rowCount} rows, {preview.columns.length} columns detected. Choose the latitude/longitude columns.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Latitude column</span>
          <Select value={latField} onValueChange={(value) => setLatField(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {preview.columns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Longitude column</span>
          <Select value={lonField} onValueChange={(value) => setLonField(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {preview.columns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {preview.sampleRows.length > 0 && (
        <div className="max-h-24 overflow-auto rounded-sm border border-border">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr>
                {preview.columns.map((column) => (
                  <th key={column} className="border-b border-border px-1.5 py-1 font-mono text-muted-foreground">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.slice(0, 5).map((row, index) => (
                <tr key={index}>
                  {preview.columns.map((column) => (
                    <td key={column} className="truncate px-1.5 py-1">
                      {String(row[column] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PointUploadForm() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [categoryMode, setCategoryMode] = useState<"field" | "single">("field");
  const [typeField, setTypeField] = useState("type");
  const [defaultType, setDefaultType] = useState("");
  const [latField, setLatField] = useState("");
  const [lonField, setLonField] = useState("");

  const upload = useUploadPointDataset();
  const preview = usePreviewTabularPoints();
  const tabular = file && isTabularFile(file);

  const handleSelectFile = (next: File | null) => {
    setFile(next);
    preview.reset();
    setLatField("");
    setLonField("");
    if (next && isTabularFile(next)) {
      preview.mutate(next, {
        onSuccess: (result) => {
          setLatField(guessField(result.columns, /^(lat|latitude)$/i));
          setLonField(guessField(result.columns, /^(lon|lng|longitude)$/i));
        },
      });
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    const categorySource: CategorySource =
      categoryMode === "field" ? { typeField: typeField.trim() || "type" } : { defaultType: defaultType.trim() };
    if (categoryMode === "single" && !("defaultType" in categorySource && categorySource.defaultType)) return;
    if (tabular && (!latField || !lonField)) return;

    upload.mutate(
      {
        name: name.trim(),
        file,
        categorySource,
        latLonFields: tabular ? { latField, lonField } : undefined,
      },
      {
        onSuccess: () => {
          setName("");
          setFile(null);
          setDefaultType("");
          setLatField("");
          setLonField("");
        },
      },
    );
  };

  const canSubmit = Boolean(
    name.trim() &&
      file &&
      (categoryMode === "field" || defaultType.trim()) &&
      (!tabular || (latField && lonField)) &&
      !preview.isPending,
  );

  return (
    <form className="flex flex-col gap-2" onSubmit={handleUpload}>
      <SectionLabel>Upload point data</SectionLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />
      <FileDropzone
        file={file}
        onSelect={handleSelectFile}
        accept={POINT_UPLOAD_ACCEPT}
        placeholder="Drop a GeoJSON, CSV, or Excel file, or click to browse"
      />
      {preview.isPending && <p className="text-[11px] text-muted-foreground">Reading columns...</p>}
      {preview.isError && (
        <p className="text-xs text-destructive">Couldn&apos;t read that file — check it&apos;s a valid CSV or Excel file.</p>
      )}
      {tabular && preview.data && (
        <TabularColumnMappingFields
          preview={preview.data}
          latField={latField}
          setLatField={setLatField}
          lonField={lonField}
          setLonField={setLonField}
        />
      )}
      <CategoryUploadFields
        categoryMode={categoryMode}
        setCategoryMode={setCategoryMode}
        typeField={typeField}
        setTypeField={setTypeField}
        defaultType={defaultType}
        setDefaultType={setDefaultType}
      />
      <Button type="submit" disabled={upload.isPending || !canSubmit}>
        <Upload className="size-3.5" />
        Upload
      </Button>
      {upload.isError && (
        <p className="text-xs text-destructive">Upload failed — check the file and column/category settings.</p>
      )}
    </form>
  );
}

/**
 * The big, focused surface for working with a dataset's rows — this is the core of the
 * data view, so it gets most of the viewport rather than being squeezed into the sidebar.
 * The map stays visible behind the overlay since row clicks (via DatasetTable) sync
 * selection/pan onto it.
 */
function DatasetTableDialog({
  dataset,
  open,
  onOpenChange,
}: {
  dataset: Dataset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail } = useDatasetDetail(dataset?.id ?? "", open && dataset !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[95vw] max-w-6xl flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{dataset?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          {detail ? <DatasetTable dataset={detail} /> : <p className="text-sm text-muted-foreground">Loading...</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DatasetRow({ dataset, onView }: { dataset: Dataset; onView: () => void }) {
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);
  const toggleDatasetVisibility = useMapStore((state) => state.toggleDatasetVisibility);
  const setDrawFeatureMode = useMapStore((state) => state.setDrawFeatureMode);
  const downloadDataset = useDownloadDataset();
  const isVisible = visibleDatasetIds.includes(dataset.id);
  const Icon = KIND_ICONS[dataset.geometryKind];

  return (
    <li className="border-b border-border py-2 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => toggleDatasetVisibility(dataset.id)}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <span className={cn("size-2 shrink-0 border border-trace", isVisible && "bg-trace")} />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm">{dataset.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {dataset.featureCount} {dataset.geometryKind === "track" ? "pts" : "features"}
            {dataset.geometryKind === "track" && ` · ${formatDate(dataset.dateStart)}`}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-none"
          onClick={onView}
          aria-label="View data"
        >
          <Table2 className="size-3.5" />
        </Button>
        {dataset.geometryKind === "point" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => setDrawFeatureMode({ datasetId: dataset.id, kind: "point" })}
            aria-label="Add point"
          >
            <Plus className="size-3.5" />
          </Button>
        )}
        {dataset.geometryKind === "polygon" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => setDrawFeatureMode({ datasetId: dataset.id, kind: "polygon" })}
            aria-label="Draw polygon"
          >
            <PenTool className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-none"
          onClick={() => downloadDataset.mutate({ datasetId: dataset.id, name: dataset.name })}
          aria-label="Download dataset"
        >
          <Download className="size-3.5" />
        </Button>
      </div>
      {(dataset.categories.length > 0 || dataset.tags.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-9">
          {dataset.categories.map((category) => (
            <Badge key={category} variant="outline" className="gap-1.5 text-[10px]">
              <CategoryDot category={category} />
              {category}
            </Badge>
          ))}
          {dataset.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {dataset.geometryKind === "track" && isVisible && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <TrackTimeSlider trackId={dataset.id} />
          </Suspense>
        </ErrorBoundary>
      )}
    </li>
  );
}

function DatasetList() {
  const datasetsQuery = useDatasets({ limit: 100 });
  const [viewingDatasetId, setViewingDatasetId] = useState<string | null>(null);
  const viewingDataset = datasetsQuery.data?.data.find((dataset) => dataset.id === viewingDatasetId) ?? null;

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Datasets</SectionLabel>
      {datasetsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {datasetsQuery.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No datasets uploaded yet.</p>
      )}
      <ul className="flex flex-col">
        {datasetsQuery.data?.data.map((dataset) => (
          <DatasetRow key={dataset.id} dataset={dataset} onView={() => setViewingDatasetId(dataset.id)} />
        ))}
      </ul>
      <DatasetTableDialog
        dataset={viewingDataset}
        open={viewingDataset !== null}
        onOpenChange={(open) => !open && setViewingDatasetId(null)}
      />
    </div>
  );
}

export function GeodataPanel() {
  const uploadPolygonDataset = useUploadPolygonDataset();

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tabs defaultValue="browse">
        <TabsList className="w-full">
          <TabsTrigger value="browse" className="flex-1">Datasets</TabsTrigger>
          <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="browse" className="mt-4">
          <div className="flex flex-col gap-4">
            <LiveResultsPanel />
            <AreaSelectToolbar />
            <Separator />
            <DatasetList />
          </div>
        </TabsContent>
        <TabsContent value="upload" className="mt-4">
          <Tabs defaultValue="track">
            <TabsList className="w-full">
              <TabsTrigger value="track" className="flex-1">Track</TabsTrigger>
              <TabsTrigger value="points" className="flex-1">Points</TabsTrigger>
              <TabsTrigger value="polygons" className="flex-1">Polygons</TabsTrigger>
            </TabsList>
            <TabsContent value="track" className="mt-4">
              <TrackUploadForm />
            </TabsContent>
            <TabsContent value="points" className="mt-4">
              <PointUploadForm />
            </TabsContent>
            <TabsContent value="polygons" className="mt-4">
              <CategorizedUploadForm label="Upload polygon data" upload={uploadPolygonDataset} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
