import { useQuery } from "@tanstack/react-query";
import { getRoutingCoverage } from "@/features/coverage/api";

export function useRoutingCoverage() {
  return useQuery({
    queryKey: ["routing-coverage"],
    queryFn: getRoutingCoverage,
    // Deployment-static — only changes when an administrator rebuilds/redeploys tiles.
    staleTime: Infinity,
  });
}
