"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useDatasets } from "@/features/geodata/hooks/use-datasets";
import type { PointDatasetAvoidance } from "@/features/routing/types";

const ANY_CATEGORY = "__any__";

function emptyAvoidance(datasetId: string): PointDatasetAvoidance {
  return { datasetId, category: null, includeTags: [], excludeTags: [], corridorM: 1_000, bufferM: 50 };
}

/** Repeatable "avoid this category of an uploaded point dataset (cameras, checkpoints, etc.) within this distance" rules. */
export function AvoidDatasetListEditor({
  value,
  onChange,
}: {
  value: PointDatasetAvoidance[];
  onChange: (next: PointDatasetAvoidance[]) => void;
}) {
  const { data: datasets } = useDatasets({ geometryKind: "point", limit: 100 });
  const options = datasets?.data ?? [];

  const update = (index: number, entry: PointDatasetAvoidance) => {
    onChange(value.map((existing, i) => (i === index ? entry : existing)));
  };
  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };
  const add = () => {
    if (options.length === 0) return;
    onChange([...value, emptyAvoidance(options[0].id)]);
  };

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Upload a point dataset (e.g. camera or checkpoint locations, under Data) to avoid it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((entry, index) => {
        const dataset = options.find((option) => option.id === entry.datasetId);
        return (
          <div key={index} className="flex flex-col gap-1.5 rounded-md border border-input p-2">
            <div className="flex items-center gap-1.5">
              <Select
                value={entry.datasetId}
                onValueChange={(next) => next && update(index, { ...entry, datasetId: next, category: null })}
              >
                <SelectTrigger className="h-8 flex-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label="Remove avoidance">
                <X className="size-3.5" />
              </Button>
            </div>
            <Select
              value={entry.category ?? ANY_CATEGORY}
              onValueChange={(next) => next && update(index, { ...entry, category: next === ANY_CATEGORY ? null : next })}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CATEGORY}>Any category</SelectItem>
                {(dataset?.categories ?? []).map((category) => (
                  <SelectItem key={category} value={category}>
                    {category.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">
                Avoid within: {entry.bufferM >= 1_000 ? `${(entry.bufferM / 1_000).toFixed(1)} km` : `${entry.bufferM} m`}
              </Label>
              <Slider
                value={[entry.bufferM]}
                min={10}
                max={2_000}
                step={10}
                onValueChange={(next) => update(index, { ...entry, bufferM: (next as number[])[0] })}
              />
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={add}>
        <Plus className="size-3.5" />
        Add avoidance
      </Button>
    </div>
  );
}
