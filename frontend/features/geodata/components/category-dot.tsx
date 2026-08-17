"use client";

import { colorForCategory } from "@/features/geodata/lib/category-icons";
import { useCategoryColorStore } from "@/features/geodata/category-color-store";
import { cn } from "@/lib/utils";

/** Small color swatch for a category, reflecting any user override. */
export function CategoryDot({ category, className }: { category: string; className?: string }) {
  const overrides = useCategoryColorStore((state) => state.overrides);
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: colorForCategory(category, overrides) }}
    />
  );
}
