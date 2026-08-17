import { useQuery } from "@tanstack/react-query";
import { listDatasets } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";
import type { DatasetGeometryKind } from "@/features/geodata/types";

export function useDatasets(params?: { page?: number; limit?: number; geometryKind?: DatasetGeometryKind }) {
  return useQuery({
    queryKey: datasetKeys.list(params),
    queryFn: () => listDatasets(params),
  });
}
