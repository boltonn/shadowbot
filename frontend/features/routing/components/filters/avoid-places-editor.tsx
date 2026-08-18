"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

/** Free-text named places/roads to avoid (e.g. "downtown", "I-95"), plus the shared buffer radius applied to each. */
export function AvoidPlacesEditor({
  places,
  radiusM,
  onPlacesChange,
  onRadiusChange,
}: {
  places: string[];
  radiusM: number;
  onPlacesChange: (next: string[]) => void;
  onRadiusChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const next = draft.trim();
    if (next && !places.includes(next)) onPlacesChange([...places, next]);
    setDraft("");
  };

  const remove = (place: string) => {
    onPlacesChange(places.filter((existing) => existing !== place));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        {places.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {places.map((place) => (
              <Badge key={place} variant="secondary" className="gap-1 text-[10px]">
                {place}
                <button type="button" onClick={() => remove(place)} aria-label={`Remove ${place}`}>
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
          placeholder="e.g. downtown, I-95 — press Enter to add"
          className="h-8 text-sm"
        />
      </div>
      {places.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-normal text-muted-foreground">
            Avoid within: {radiusM >= 1000 ? `${(radiusM / 1000).toFixed(1)} km` : `${radiusM} m`}
          </Label>
          <Slider
            value={[radiusM]}
            min={50}
            max={5_000}
            step={50}
            onValueChange={(next) => onRadiusChange((next as number[])[0])}
          />
        </div>
      )}
    </div>
  );
}
