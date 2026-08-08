"use client";

import { usePointDatasets } from "@/features/geodata/hooks/use-point-datasets";
import { colorForCategory, iconForCategory } from "@/features/geodata/lib/category-icons";
import { useMapStore } from "@/features/map/store";

/**
 * Floating map legend for whichever point datasets are currently toggled
 * visible — ties the icon/color shown per category (whether the dataset is
 * rendering individual icons or clustered dots) back to a label.
 */
export function PointDatasetLegend() {
  const visiblePointDatasetIds = useMapStore((state) => state.visiblePointDatasetIds);
  const { data } = usePointDatasets();

  if (visiblePointDatasetIds.length === 0) return null;

  const categories = Array.from(
    new Set(
      (data?.data ?? [])
        .filter((dataset) => visiblePointDatasetIds.includes(dataset.id))
        .flatMap((dataset) => dataset.categories),
    ),
  ).sort();

  if (categories.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex flex-col gap-1.5 rounded-sm border border-border bg-background/85 px-3 py-2 backdrop-blur-sm">
      <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Legend</span>
      <ul className="flex flex-col gap-1">
        {categories.map((category) => {
          const Icon = iconForCategory(category);
          return (
            <li key={category} className="flex items-center gap-2">
              <Icon className={`${colorForCategory(category)} size-3.5`} strokeWidth={2.5} />
              <span className="text-xs text-foreground capitalize">{category}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
