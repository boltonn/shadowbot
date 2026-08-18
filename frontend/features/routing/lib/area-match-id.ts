import type { AreaMatch } from "@/features/routing/types";

/** Stable-enough key for an AreaMatch — it has no id of its own, so fall back to its list index. */
export function areaMatchId(area: AreaMatch, index: number): string {
  return area.osmId != null ? `${area.osmType}-${area.osmId}` : `idx-${index}`;
}
