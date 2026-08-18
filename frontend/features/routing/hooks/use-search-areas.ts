import { useMutation } from "@tanstack/react-query";
import { searchAreas } from "@/features/routing/api";
import { useMapStore } from "@/features/map/store";
import type { AreaMatch, AreaSearchRequest } from "@/features/routing/types";

/** Finds polygon area features near a point and plots every match. */
export function useSearchAreas() {
  const setMatchedAreas = useMapStore((state) => state.setMatchedAreas);

  return useMutation<AreaMatch[], Error, AreaSearchRequest>({
    mutationFn: searchAreas,
    onSuccess: (matches) => setMatchedAreas(matches),
  });
}
