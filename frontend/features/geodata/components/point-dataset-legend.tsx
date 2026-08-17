"use client";

import { useDatasets } from "@/features/geodata/hooks/use-datasets";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { colorForCategory, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useMapStore } from "@/features/map/store";

/**
 * Floating map legend for whichever point datasets are currently toggled
 * visible — ties the icon/color shown per category (whether the dataset is
 * rendering individual icons or clustered dots) back to a label, and lets
 * the color be changed per category.
 */
export function PointDatasetLegend() {
  const visibleDatasetIds = useMapStore((state) => state.visibleDatasetIds);
  const { data } = useDatasets({ geometryKind: "point" });
  const overrides = useCategoryColorStore((state) => state.overrides);
  const setCategoryColor = useCategoryColorStore((state) => state.setCategoryColor);

  if (visibleDatasetIds.length === 0) return null;

  const categories = Array.from(
    new Set(
      (data?.data ?? [])
        .filter((dataset) => visibleDatasetIds.includes(dataset.id))
        .flatMap((dataset) => dataset.categories),
    ),
  ).sort();

  if (categories.length === 0) return null;

  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-1.5 rounded-sm border border-border bg-background/85 px-3 py-2 backdrop-blur-sm">
      <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Legend</span>
      <ul className="flex flex-col gap-1">
        {categories.map((category) => {
          const Icon = iconForCategory(category);
          const color = colorForCategory(category, overrides);
          return (
            <li key={category} className="flex items-center gap-2">
              <Icon className="size-3.5" style={{ color }} strokeWidth={2.5} />
              <span className="flex-1 text-xs text-foreground capitalize">{category}</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setCategoryColor(category, e.target.value)}
                aria-label={`Color for ${category}`}
                className="size-3.5 cursor-pointer rounded-sm border-none bg-transparent p-0"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
