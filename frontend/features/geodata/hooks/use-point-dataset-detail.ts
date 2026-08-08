import { useQuery } from "@tanstack/react-query";
import { getPointDataset } from "@/features/geodata/api";

export function usePointDatasetDetail(datasetId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["point-datasets", datasetId],
    queryFn: () => getPointDataset(datasetId),
    enabled,
  });
}
