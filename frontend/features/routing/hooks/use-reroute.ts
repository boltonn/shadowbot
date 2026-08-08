import { useMutation } from "@tanstack/react-query";
import { reroute } from "@/features/routing/api";
import type { RerouteRequest } from "@/features/routing/types";

export function useReroute() {
  return useMutation({
    mutationFn: ({ routeId, request }: { routeId: string; request: RerouteRequest }) =>
      reroute(routeId, request),
  });
}
