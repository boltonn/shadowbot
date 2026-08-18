"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OsmTag } from "@/features/routing/types";

/** Editable list of raw OSM key/value tag pairs, e.g. for through_raw_tags/raw_tags fields. */
export function OsmTagListEditor({ value, onChange }: { value: OsmTag[]; onChange: (next: OsmTag[]) => void }) {
  const update = (index: number, tag: OsmTag) => {
    onChange(value.map((existing, i) => (i === index ? tag : existing)));
  };
  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {value.map((tag, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={tag.key}
            onChange={(e) => update(index, { ...tag, key: e.target.value })}
            placeholder="key"
            className="h-8 text-sm"
          />
          <Input
            value={tag.value}
            onChange={(e) => update(index, { ...tag, value: e.target.value })}
            placeholder="value"
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(index)}
            aria-label="Remove tag"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, { key: "", value: "" }])}
      >
        <Plus className="size-3.5" />
        Add raw OSM tag
      </Button>
    </div>
  );
}
