import { apiClient } from "@/lib/api-client";
import type { GeocodeResult, RerouteRequest, Route, RouteRequest } from "@/features/routing/types";

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const response = await apiClient.post<GeocodeResult[]>("/geocode", { query, limit: 5 });
  return response.data;
}

export async function createRoute(request: RouteRequest): Promise<Route> {
  const response = await apiClient.post<Route>("/routes", request);
  return response.data;
}

export async function reroute(routeId: string, request: RerouteRequest): Promise<Route> {
  const response = await apiClient.post<Route>(`/routes/${routeId}/reroute`, request);
  return response.data;
}
