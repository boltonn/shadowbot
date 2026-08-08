"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapMarker, MarkerContent, MarkerTooltip, MapRoute, useMap } from "@/components/ui/map";
import { useTrackDetail } from "@/features/geodata/hooks/use-track-detail";
import { fitToCoordinates } from "@/features/map/lib/fit-bounds";
import { filterTrackPoints } from "@/features/geodata/lib/track-filter";
import { useMapStore } from "@/features/map/store";

export function TrackLayer({ trackId }: { trackId: string }) {
  const { map } = useMap();
  const { data: track } = useTrackDetail(trackId, true);
  const timeWindow = useMapStore((state) => state.trackTimeWindows[trackId]);
  const selectedArea = useMapStore((state) => state.selectedArea);
  const hasFitRef = useRef(false);

  useEffect(() => {
    if (!map || !track || track.points.length === 0 || hasFitRef.current) return;
    hasFitRef.current = true;
    fitToCoordinates(
      map,
      track.points.map((point) => point.geometry.coordinates as [number, number]),
    );
  }, [map, track]);

  const filteredPoints = useMemo(() => {
    if (!track) return [];
    return filterTrackPoints(track.points, timeWindow, selectedArea);
  }, [track, timeWindow, selectedArea]);

  if (!track || track.points.length < 2) return null;

  return (
    <>
      <MapRoute
        id={`track-${trackId}`}
        coordinates={track.points.map((point) => point.geometry.coordinates as [number, number])}
        color="#ffb020"
        width={2}
        opacity={0.25}
        dashArray={[2, 2]}
        interactive={false}
      />
      {filteredPoints.map((point) => {
        const [longitude, latitude] = point.geometry.coordinates as [number, number];
        return (
          <MapMarker key={point.id} longitude={longitude} latitude={latitude}>
            <MarkerContent>
              <span className="block size-1.5 rounded-full bg-[#ffb020] ring-1 ring-black/40" />
            </MarkerContent>
            <MarkerTooltip>{new Date(point.dateRecorded).toLocaleString()}</MarkerTooltip>
          </MapMarker>
        );
      })}
    </>
  );
}
