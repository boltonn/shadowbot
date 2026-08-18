"use client";

import { Badge } from "@/components/ui/badge";
import { CategoryDot } from "@/features/geodata/components/category-dot";
import { cn } from "@/lib/utils";
import type { PoiCategory } from "@/features/routing/types";

/** Every PoiCategory value (backend/src/shadowbot/schemas/poi.py's PoiCategory enum). */
export const POI_CATEGORIES: PoiCategory[] = [
  "gas_station",
  "ev_charging",
  "supermarket",
  "restaurant",
  "coffee",
  "parking",
  "rest_area",
  "hotel",
  "pharmacy",
  "hospital",
  "gym",
  "park",
  "bank",
  "atm",
  "car_repair",
  "campground",
];

/** Multi-select category chips, e.g. for through_categories/categories fields. */
export function CategoryMultiSelect({
  value,
  onChange,
}: {
  value: PoiCategory[];
  onChange: (next: PoiCategory[]) => void;
}) {
  const toggle = (category: PoiCategory) => {
    onChange(value.includes(category) ? value.filter((c) => c !== category) : [...value, category]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {POI_CATEGORIES.map((category) => (
        <Badge
          key={category}
          variant="outline"
          render={<button type="button" onClick={() => toggle(category)} />}
          className={cn(
            "gap-1.5 text-[10px]",
            value.includes(category) ? "border-ring text-foreground" : "text-muted-foreground",
          )}
        >
          <CategoryDot category={category} />
          {category.replace(/_/g, " ")}
        </Badge>
      ))}
    </div>
  );
}
