"use client";

import { useState } from "react";
import { Info, Pencil, Route as RouteIcon, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { useUploadPointDataset } from "@/features/geodata/hooks/use-upload-point-dataset";
import { colorForLocation, iconForCategory } from "@/features/geodata/lib/category-icons";
import type { ChatLocation } from "@/features/map/types";
import { useMapStore } from "@/features/map/store";
import { centroidOf } from "@/features/map/lib/geometry";
import { formatDistance, formatDuration } from "@/features/routing/lib/format";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{children}</span>
  );
}

/**
 * Bundles the currently plotted chat locations into a GeoJSON file the existing upload flow can
 * ingest. Uploads as a *point* dataset, so a Polygon location (e.g. an area match) degrades to a
 * Point at its centroid rather than keeping its full boundary.
 */
function chatLocationsToFile(locations: ChatLocation[]): File {
  const featureCollection = {
    type: "FeatureCollection" as const,
    features: locations.map((location) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: centroidOf(location.geometry) },
      properties: { kind: location.kind, name: location.label, ...location.properties },
    })),
  };
  return new File([JSON.stringify(featureCollection)], "live-from-chat.geojson", { type: "application/geo+json" });
}

function SaveAsDatasetDialog({ locations }: { locations: ChatLocation[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Live from chat");
  const upload = useUploadPointDataset();

  const handleSave = () => {
    if (!name.trim()) return;
    upload.mutate(
      { name: name.trim(), file: chatLocationsToFile(locations), categorySource: { typeField: "kind" } },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        onClick={() => setOpen(true)}
        aria-label="Save as dataset"
      >
        <Save className="size-3.5" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as dataset</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-muted-foreground">
            Persists all {locations.length} location{locations.length === 1 ? "" : "s"} currently plotted from chat
            as a point dataset — it'll keep showing here too.
          </p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name" />
          <Button type="button" onClick={handleSave} disabled={upload.isPending || !name.trim()}>
            <Save className="size-3.5" />
            Save
          </Button>
          {upload.isError && <p className="text-xs text-destructive">Save failed — try again.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LiveLocationRow({
  location,
  onSelect,
  onRemove,
}: {
  location: ChatLocation;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const overrides = useCategoryColorStore((state) => state.overrides);
  const locationOverrides = useCategoryColorStore((state) => state.locationOverrides);
  const setLocationColor = useCategoryColorStore((state) => state.setLocationColor);
  const renameChatLocation = useMapStore((state) => state.renameChatLocation);
  const [editing, setEditing] = useState(false);
  const Icon = iconForCategory(location.kind);
  const color = colorForLocation(location.id, location.kind, overrides, locationOverrides);

  return (
    <li className="flex items-center gap-2 border-b border-border py-1.5 last:border-b-0">
      <Icon className="size-3.5 shrink-0" style={{ color }} strokeWidth={2.5} />
      {editing ? (
        <input
          autoFocus
          defaultValue={location.label}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next) renameChatLocation(location.id, next);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full min-w-0 rounded-sm border border-input bg-transparent px-1 py-0.5 text-sm outline-none focus:border-ring"
        />
      ) : (
        <button type="button" onClick={onSelect} className="flex-1 truncate text-left text-sm">
          {location.label}
        </button>
      )}
      <input
        type="color"
        value={color}
        onChange={(e) => setLocationColor(location.id, e.target.value)}
        aria-label={`Color for ${location.label}`}
        className="size-3.5 shrink-0 cursor-pointer rounded-sm border-none bg-transparent p-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        onClick={() => setEditing(true)}
        aria-label={`Rename ${location.label}`}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        onClick={onSelect}
        aria-label={`Info for ${location.label}`}
      >
        <Info className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-none"
        onClick={onRemove}
        aria-label={`Remove ${location.label}`}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );
}

/**
 * What the agent has plotted from chat this session — locations and the active route — kept in
 * the data view alongside persisted datasets so both surfaces always show the same thing.
 */
export function LiveResultsPanel() {
  const chatLocations = useMapStore((state) => state.chatLocations);
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);
  const setSelectedChatLocationId = useMapStore((state) => state.setSelectedChatLocationId);
  const activeRoute = useMapStore((state) => state.activeRoute);
  const setActiveRoute = useMapStore((state) => state.setActiveRoute);
  const focusActiveRoute = useMapStore((state) => state.focusActiveRoute);

  if (chatLocations.length === 0 && !activeRoute) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <SectionLabel>Live from chat</SectionLabel>
        <div className="flex items-center gap-0.5">
          {chatLocations.length > 0 && <SaveAsDatasetDialog locations={chatLocations} />}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => {
              applyChatLocationsUpdate("replace", [], []);
              setActiveRoute(null);
            }}
            aria-label="Clear live results"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <ul className="flex flex-col">
        {activeRoute && (
          <li className="flex items-center gap-2.5 border-b border-border py-1.5 last:border-b-0">
            <RouteIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <button type="button" onClick={focusActiveRoute} className="flex-1 truncate text-left text-sm">
              {formatDistance(activeRoute.distanceM)} · {formatDuration(activeRoute.durationS)}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              onClick={focusActiveRoute}
              aria-label="Focus route on map"
            >
              <Info className="size-3.5" />
            </Button>
          </li>
        )}
        {chatLocations.map((location) => (
          <LiveLocationRow
            key={location.id}
            location={location}
            onSelect={() => setSelectedChatLocationId(location.id)}
            onRemove={() => applyChatLocationsUpdate("remove", [], [location.id])}
          />
        ))}
      </ul>
    </div>
  );
}
