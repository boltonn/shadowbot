"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/** Free-text chip input for raw OSM highway= values, e.g. ['path', 'footway', 'residential']. */
export function WayTypesInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const next = draft.trim();
    if (next && !value.includes(next)) onChange([...value, next]);
    setDraft("");
  };

  const remove = (wayType: string) => {
    onChange(value.filter((existing) => existing !== wayType));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((wayType) => (
            <Badge key={wayType} variant="secondary" className="gap-1 text-[10px]">
              {wayType}
              <button type="button" onClick={() => remove(wayType)} aria-label={`Remove ${wayType}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder="e.g. path, footway, residential — press Enter to add"
        className="h-8 text-sm"
      />
    </div>
  );
}
