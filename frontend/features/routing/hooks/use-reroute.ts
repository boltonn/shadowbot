import { useMutation } from "@tanstack/react-query";
import { reroute } from "@/features/routing/api";
import { useMapStore } from "@/features/map/store";
import type { RerouteRequest, Route } from "@/features/routing/types";

/** Recomputes the active route (e.g. after inserting/removing a stop) and plots the result. */
export function useReroute() {
  const setActiveRoute = useMapStore((state) => state.setActiveRoute);

  return useMutation<Route, Error, { routeId: string; body: RerouteRequest }>({
    mutationFn: ({ routeId, body }) => reroute(routeId, body),
    onSuccess: (route) => setActiveRoute(route),
  });
}
