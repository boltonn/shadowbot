import { apiClient } from "@/lib/api-client";
import type {
  AreaMatch,
  AreaSearchRequest,
  ArrivalEstimate,
  ArrivalEstimateRequest,
  RerouteRequest,
  Route,
  RouteRequest,
  RouteSearchCriteria,
  RouteSearchMatch,
} from "@/features/routing/types";

export async function planRoute(body: RouteRequest): Promise<Route> {
  const response = await apiClient.post<Route>("/routes", body);
  return response.data;
}

export async function reroute(routeId: string, body: RerouteRequest): Promise<Route> {
  const response = await apiClient.post<Route>(`/routes/${routeId}/reroute`, body);
  return response.data;
}

export async function searchRoutes(body: RouteSearchCriteria): Promise<RouteSearchMatch[]> {
  const response = await apiClient.post<RouteSearchMatch[]>("/routes/search", body);
  return response.data;
}

export async function searchAreas(body: AreaSearchRequest): Promise<AreaMatch[]> {
  const response = await apiClient.post<AreaMatch[]>("/areas/search", body);
  return response.data;
}

export async function estimateArrival(routeId: string, body: ArrivalEstimateRequest): Promise<ArrivalEstimate> {
  const response = await apiClient.post<ArrivalEstimate>(`/routes/${routeId}/arrival-estimate`, body);
  return response.data;
}
