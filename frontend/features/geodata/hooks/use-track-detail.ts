import { useQuery } from "@tanstack/react-query";
import { getTrack } from "@/features/geodata/api";

export function useTrackDetail(trackId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tracks", trackId],
    queryFn: () => getTrack(trackId),
    enabled,
  });
}
