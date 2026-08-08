"use client";

import { useRef, useState } from "react";
import { FileUp, Square, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTracks } from "@/features/geodata/hooks/use-tracks";
import { useUploadTrack } from "@/features/geodata/hooks/use-upload-track";
import { usePointDatasets } from "@/features/geodata/hooks/use-point-datasets";
import { useUploadPointDataset } from "@/features/geodata/hooks/use-upload-point-dataset";
import { colorForCategory } from "@/features/geodata/lib/category-icons";
import { TrackTimeSlider } from "@/features/geodata/components/track-time-slider";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

const GEOJSON_ACCEPT = ".geojson,.json,application/geo+json,application/json";

function formatDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{children}</span>
  );
}

function FileDropzone({ file, onSelect }: { file: File | null; onSelect: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={GEOJSON_ACCEPT}
        className="sr-only"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors",
          isDragging ? "border-ring bg-accent/50" : "border-input hover:border-ring hover:bg-accent/30",
        )}
      >
        <FileUp className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate text-sm", file ? "text-foreground" : "text-muted-foreground")}>
          {file ? file.name : "Drop a GeoJSON file, or click to browse"}
        </span>
      </button>
    </div>
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

function AreaSelectToolbar() {
  const isAreaSelectMode = useMapStore((state) => state.isAreaSelectMode);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setAreaSelectMode = useMapStore((state) => state.setAreaSelectMode);
  const setSelectedArea = useMapStore((state) => state.setSelectedArea);

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
          variant={isAreaSelectMode ? "default" : "outline"}
          size="sm"
          className="rounded-none"
          onClick={() => setAreaSelectMode(!isAreaSelectMode)}
        >
          <Square className="size-3.5" />
          {isAreaSelectMode ? "Click + drag..." : "Draw area"}
        </Button>
      </div>
    </div>
  );
}

function TrackList() {
  const tracksQuery = useTracks();
  const visibleTrackIds = useMapStore((state) => state.visibleTrackIds);
  const toggleTrackVisibility = useMapStore((state) => state.toggleTrackVisibility);

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Tracks</SectionLabel>
      {tracksQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {tracksQuery.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No tracks uploaded yet.</p>
      )}
      <ul className="flex flex-col">
        {tracksQuery.data?.data.map((track) => {
          const isVisible = visibleTrackIds.includes(track.id);
          return (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => toggleTrackVisibility(track.id)}
                className="flex w-full items-center gap-2.5 border-b border-border py-2 text-left last:border-b-0"
              >
                <span className={cn("size-2 shrink-0 border border-trace", isVisible && "bg-trace")} />
                <span className="flex-1 truncate text-sm">{track.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {track.pointCount} pts &middot; {formatDate(track.dateStart)}
                </span>
              </button>
              {isVisible && <TrackTimeSlider trackId={track.id} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PointsUploadForm() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [categoryMode, setCategoryMode] = useState<"field" | "single">("field");
  const [typeField, setTypeField] = useState("type");
  const [defaultType, setDefaultType] = useState("");
  const uploadPointDataset = useUploadPointDataset();

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    const categorySource =
      categoryMode === "field" ? { typeField: typeField.trim() || "type" } : { defaultType: defaultType.trim() };
    if (categoryMode === "single" && !("defaultType" in categorySource && categorySource.defaultType)) return;

    uploadPointDataset.mutate(
      { name: name.trim(), file, categorySource },
      { onSuccess: () => { setName(""); setFile(null); setDefaultType(""); } },
    );
  };

  const canSubmit = Boolean(name.trim() && file && (categoryMode === "field" || defaultType.trim()));

  return (
    <form className="flex flex-col gap-2" onSubmit={handleUpload}>
      <SectionLabel>Upload point data</SectionLabel>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />

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
            Each point&apos;s icon comes from this property, so one file can mix categories.
          </p>
        </TabsContent>
        <TabsContent value="single" className="mt-2">
          <Input
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value)}
            placeholder="Type for every point (e.g. vehicle)"
          />
        </TabsContent>
      </Tabs>

      <FileDropzone file={file} onSelect={setFile} />
      <Button type="submit" disabled={uploadPointDataset.isPending || !canSubmit}>
        <Upload className="size-3.5" />
        Upload GeoJSON
      </Button>
      {uploadPointDataset.isError && (
        <p className="text-xs text-destructive">Upload failed — check the file and category settings.</p>
      )}
    </form>
  );
}

function PointDatasetList() {
  const datasetsQuery = usePointDatasets();
  const visiblePointDatasetIds = useMapStore((state) => state.visiblePointDatasetIds);
  const togglePointDatasetVisibility = useMapStore((state) => state.togglePointDatasetVisibility);

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Point datasets</SectionLabel>
      {datasetsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {datasetsQuery.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No point data uploaded yet.</p>
      )}
      <ul className="flex flex-col">
        {datasetsQuery.data?.data.map((dataset) => {
          const isVisible = visiblePointDatasetIds.includes(dataset.id);
          return (
            <li key={dataset.id}>
              <button
                type="button"
                onClick={() => togglePointDatasetVisibility(dataset.id)}
                className="flex w-full flex-col gap-1.5 border-b border-border py-2 text-left last:border-b-0"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn("size-2 shrink-0 border border-trace", isVisible && "bg-trace")} />
                  <span className="flex-1 truncate text-sm">{dataset.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{dataset.pointCount} pts</span>
                </div>
                {dataset.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-4.5">
                    {dataset.categories.map((category) => (
                      <Badge key={category} variant="outline" className="gap-1.5 text-[10px]">
                        <span className={cn("size-1.5 rounded-full", colorForCategory(category).replace("text-", "bg-"))} />
                        {category}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GeodataPanel() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Tabs defaultValue="track">
        <TabsList className="w-full">
          <TabsTrigger value="track" className="flex-1">Track</TabsTrigger>
          <TabsTrigger value="points" className="flex-1">Points</TabsTrigger>
        </TabsList>
        <TabsContent value="track" className="mt-4">
          <div className="flex flex-col gap-4">
            <TrackUploadForm />
            <Separator />
            <AreaSelectToolbar />
            <TrackList />
          </div>
        </TabsContent>
        <TabsContent value="points" className="mt-4">
          <div className="flex flex-col gap-4">
            <PointsUploadForm />
            <Separator />
            <PointDatasetList />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
