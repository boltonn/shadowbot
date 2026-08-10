import { useQuery } from "@tanstack/react-query";
import { listDatasets } from "@/features/geodata/api";
import type { DatasetGeometryKind } from "@/features/geodata/types";

export function useDatasets(params?: { page?: number; limit?: number; geometryKind?: DatasetGeometryKind }) {
  return useQuery({
    queryKey: ["datasets", params],
    queryFn: () => listDatasets(params),
  });
}
