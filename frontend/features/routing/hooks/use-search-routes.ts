import { useMutation } from "@tanstack/react-query";
import { searchRoutes } from "@/features/routing/api";
import { useMapStore } from "@/features/map/store";
import type { RouteSearchCriteria, RouteSearchMatch } from "@/features/routing/types";

/** Generates candidate routes matching a criteria search and plots every match. */
export function useSearchRoutes() {
  const setMatchedRoutes = useMapStore((state) => state.setMatchedRoutes);

  return useMutation<RouteSearchMatch[], Error, RouteSearchCriteria>({
    mutationFn: searchRoutes,
    onSuccess: (matches) => setMatchedRoutes(matches),
  });
}
