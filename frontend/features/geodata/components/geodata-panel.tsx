"use client";

import { useState } from "react";
import { ChevronRight, Download, MapIcon, Route as RouteIcon, Shapes, Square, Table2, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatasetTable } from "@/features/geodata/components/dataset-table";
import { TrackTimeSlider } from "@/features/geodata/components/track-time-slider";
import { useDatasetDetail } from "@/features/geodata/hooks/use-dataset-detail";
import { useDatasets } from "@/features/geodata/hooks/use-datasets";
import { useDownloadDataset } from "@/features/geodata/hooks/use-download-dataset";
import { useUploadPointDataset } from "@/features/geodata/hooks/use-upload-point-dataset";
import { useUploadPolygonDataset } from "@/features/geodata/hooks/use-upload-polygon-dataset";
import { useUploadTrack } from "@/features/geodata/hooks/use-upload-track";
import { colorForCategory, KNOWN_CATEGORIES } from "@/features/geodata/lib/category-icons";
import type { Dataset, DatasetGeometryKind } from "@/features/geodata/types";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

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
      <span className={cn("size-1.5 rounded-full", colorForCategory(category).replace("text-", "bg-"))} />
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

function DatasetTableDialog({ dataset }: { dataset: Dataset }) {
  const [open, setOpen] = useState(false);
  const { data: detail } = useDatasetDetail(dataset.id, open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="View raw data"
      >
        <Table2 className="size-3.5" />
      </Button>
      <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{dataset.name}</DialogTitle>
        </DialogHeader>
        {detail ? <DatasetTable dataset={detail} /> : <p className="text-sm text-muted-foreground">Loading...</p>}
      </DialogContent>
    </Dialog>
  );
}

function DatasetRow({ dataset }: { dataset: Dataset }) {
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);
  const toggleDatasetVisibility = useMapStore((state) => state.toggleDatasetVisibility);
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
        <DatasetTableDialog dataset={dataset} />
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
              <span className={cn("size-1.5 rounded-full", colorForCategory(category).replace("text-", "bg-"))} />
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
      {dataset.geometryKind === "track" && isVisible && <TrackTimeSlider trackId={dataset.id} />}
    </li>
  );
}

function DatasetList() {
  const datasetsQuery = useDatasets({ limit: 100 });

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Datasets</SectionLabel>
      {datasetsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {datasetsQuery.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No datasets uploaded yet.</p>
      )}
      <ul className="flex flex-col">
        {datasetsQuery.data?.data.map((dataset) => (
          <DatasetRow key={dataset.id} dataset={dataset} />
        ))}
      </ul>
    </div>
  );
}

export function GeodataPanel() {
  const uploadPointDataset = useUploadPointDataset();
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
              <CategorizedUploadForm label="Upload point data" upload={uploadPointDataset} />
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
