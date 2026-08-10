import { useQuery } from "@tanstack/react-query";
import { getDataset } from "@/features/geodata/api";

export function useDatasetDetail(datasetId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["datasets", datasetId],
    queryFn: () => getDataset(datasetId),
    enabled,
  });
}
