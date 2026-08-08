import { useQuery } from "@tanstack/react-query";
import { listTracks } from "@/features/geodata/api";

export function useTracks() {
  return useQuery({
    queryKey: ["tracks"],
    queryFn: listTracks,
  });
}
