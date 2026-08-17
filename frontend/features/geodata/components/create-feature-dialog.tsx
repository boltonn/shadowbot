"use client";

import { useState } from "react";
import type { Point, Polygon } from "geojson";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryDot } from "@/features/geodata/components/category-dot";
import { useCreatePointFeature } from "@/features/geodata/hooks/use-create-point-feature";
import { useCreatePolygonFeature } from "@/features/geodata/hooks/use-create-polygon-feature";
import { KNOWN_CATEGORIES } from "@/features/geodata/lib/category-icons";
import { useMapStore } from "@/features/map/store";
import { cn } from "@/lib/utils";

/** Appears whenever a point/polygon has been picked/drawn on the map, awaiting category/name/tags before it's saved. */
export function CreateFeatureDialog() {
  const pendingFeatureDraft = useMapStore((state) => state.pendingFeatureDraft);
  const setPendingFeatureDraft = useMapStore((state) => state.setPendingFeatureDraft);
  const setDrawFeatureMode = useMapStore((state) => state.setDrawFeatureMode);
  const createPointFeature = useCreatePointFeature();
  const createPolygonFeature = useCreatePolygonFeature();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");

  const close = () => {
    setPendingFeatureDraft(null);
    setDrawFeatureMode(null);
    setName("");
    setCategory("");
    setTags("");
  };

  const handleSave = () => {
    if (!pendingFeatureDraft || !category.trim()) return;
    const body = {
      category: category.trim(),
      name: name.trim() || null,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    if (pendingFeatureDraft.kind === "point") {
      createPointFeature.mutate(
        { datasetId: pendingFeatureDraft.datasetId, body: { ...body, geometry: pendingFeatureDraft.geometry as Point, properties: {} } },
        { onSuccess: close },
      );
    } else {
      createPolygonFeature.mutate(
        { datasetId: pendingFeatureDraft.datasetId, body: { ...body, geometry: pendingFeatureDraft.geometry as Polygon } },
        { onSuccess: close },
      );
    }
  };

  const isPending = createPointFeature.isPending || createPolygonFeature.isPending;

  return (
    <Dialog open={pendingFeatureDraft !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-full max-w-sm">
        <DialogHeader>
          <DialogTitle>{pendingFeatureDraft?.kind === "polygon" ? "New polygon" : "New point"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
          <div className="flex flex-wrap gap-1.5">
            {KNOWN_CATEGORIES.map((known) => (
              <Badge
                key={known}
                variant="outline"
                render={<button type="button" onClick={() => setCategory(known)} />}
                className={cn("gap-1.5 text-[10px]", category === known ? "border-ring text-foreground" : "text-muted-foreground")}
              >
                <CategoryDot category={known} />
                {known}
              </Badge>
            ))}
          </div>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" className="rounded-none" onClick={close}>
              Cancel
            </Button>
            <Button type="button" className="rounded-none" disabled={!category.trim() || isPending} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
