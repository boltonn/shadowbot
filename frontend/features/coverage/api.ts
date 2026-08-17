import { apiClient } from "@/lib/api-client";
import type { RoutingCoverage } from "@/features/coverage/types";

export async function getRoutingCoverage(): Promise<RoutingCoverage> {
  const response = await apiClient.get<RoutingCoverage>("/routing/coverage");
  return response.data;
}
