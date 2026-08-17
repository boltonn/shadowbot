import { apiClient } from "@/lib/api-client";
import type { GeocodeRequest, GeocodeResult } from "@/features/location/types";

export async function geocode(body: GeocodeRequest): Promise<GeocodeResult[]> {
  const response = await apiClient.post<GeocodeResult[]>("/geocode", body);
  return response.data;
}
