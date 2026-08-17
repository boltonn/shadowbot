import { useMutation } from "@tanstack/react-query";
import { planRoute } from "@/features/routing/api";
import { useMapStore } from "@/features/map/store";
import type { Route, RouteRequest } from "@/features/routing/types";

/** Plans a new route and plots it as the active route. */
export function usePlanRoute() {
  const setActiveRoute = useMapStore((state) => state.setActiveRoute);

  return useMutation<Route, Error, RouteRequest>({
    mutationFn: planRoute,
    onSuccess: (route) => setActiveRoute(route),
  });
}
