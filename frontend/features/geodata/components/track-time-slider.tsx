"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useTrackDetail } from "@/features/geodata/hooks/use-track-detail";
import { filterTrackPoints } from "@/features/geodata/lib/track-filter";
import { useMapStore } from "@/features/map/store";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TrackTimeSlider({ trackId }: { trackId: string }) {
  const { data: track } = useTrackDetail(trackId, true);
  const window = useMapStore((state) => state.trackTimeWindows[trackId]);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const setTrackTimeWindow = useMapStore((state) => state.setTrackTimeWindow);
  const clearTrackTimeWindow = useMapStore((state) => state.clearTrackTimeWindow);

  const domain = useMemo(() => {
    if (!track || track.points.length === 0) return null;
    const recordedMs = track.points.map((point) => Date.parse(point.dateRecorded));
    return {
      start: track.dateStart ? Date.parse(track.dateStart) : Math.min(...recordedMs),
      end: track.dateEnd ? Date.parse(track.dateEnd) : Math.max(...recordedMs),
    };
  }, [track]);

  const filteredCount = useMemo(() => {
    if (!track) return 0;
    return filterTrackPoints(track.points, window, selectedArea).length;
  }, [track, window, selectedArea]);

  if (!track || !domain || domain.start >= domain.end) return null;

  const [start, end] = window ? [Date.parse(window[0]), Date.parse(window[1])] : [domain.start, domain.end];

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2 pl-4.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatTime(start)} &ndash; {formatTime(end)}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            {filteredCount} / {track.points.length} pts
          </span>
          {window && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              onClick={() => clearTrackTimeWindow(trackId)}
              aria-label="Reset time window"
            >
              <RotateCcw className="size-3" />
            </Button>
          )}
        </div>
      </div>
      <Slider
        min={domain.start}
        max={domain.end}
        value={[start, end]}
        onValueChange={(value) => {
          const [nextStart, nextEnd] = value as number[];
          setTrackTimeWindow(trackId, [new Date(nextStart).toISOString(), new Date(nextEnd).toISOString()]);
        }}
      />
    </div>
  );
}
