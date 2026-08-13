import { useMutation } from "@tanstack/react-query";
import { estimateArrival } from "@/features/routing/api";
import type { ArrivalEstimate, ArrivalEstimateRequest } from "@/features/routing/types";

/** Estimates arrival time for the active route given a departure time (time-of-day heuristic, not live traffic). */
export function useEstimateArrival() {
  return useMutation<ArrivalEstimate, Error, { routeId: string; body: ArrivalEstimateRequest }>({
    mutationFn: ({ routeId, body }) => estimateArrival(routeId, body),
  });
}
