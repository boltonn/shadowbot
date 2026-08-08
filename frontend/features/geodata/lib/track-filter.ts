import type { Polygon } from "geojson";
import type { TrackPoint } from "@/features/geodata/types";
import type { TimeWindow } from "@/features/map/types";
import { isPointInBbox } from "@/lib/geo";

/** Filters track points by an optional time window and/or an optional selected area. */
export function filterTrackPoints(
  points: TrackPoint[],
  timeWindow: TimeWindow | undefined,
  area: Polygon | null,
): TrackPoint[] {
  return points.filter((point) => {
    if (timeWindow) {
      const recordedMs = Date.parse(point.dateRecorded);
      if (recordedMs < Date.parse(timeWindow[0]) || recordedMs > Date.parse(timeWindow[1])) return false;
    }
    if (area && !isPointInBbox(point.geometry.coordinates as [number, number], area)) return false;
    return true;
  });
}
