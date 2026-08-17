import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPointFeature } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";
import type { PointFeature, PointFeatureCreate } from "@/features/geodata/types";

/** Add a single feature to an existing point dataset. */
export function useCreatePointFeature() {
  const queryClient = useQueryClient();

  return useMutation<PointFeature, Error, { datasetId: string; body: PointFeatureCreate }>({
    mutationFn: ({ datasetId, body }) => createPointFeature(datasetId, body),
    onSuccess: (_data, { datasetId }) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.detail(datasetId) });
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}
