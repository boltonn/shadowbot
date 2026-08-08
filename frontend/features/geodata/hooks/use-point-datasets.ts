import { useQuery } from "@tanstack/react-query";
import { listPointDatasets } from "@/features/geodata/api";

export function usePointDatasets() {
  return useQuery({
    queryKey: ["point-datasets"],
    queryFn: listPointDatasets,
  });
}
