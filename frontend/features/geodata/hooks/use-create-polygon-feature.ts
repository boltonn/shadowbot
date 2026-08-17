import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPolygonFeature } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";
import type { PolygonFeature, PolygonFeatureCreate } from "@/features/geodata/types";

/** Add a single feature to an existing polygon dataset. */
export function useCreatePolygonFeature() {
  const queryClient = useQueryClient();

  return useMutation<PolygonFeature, Error, { datasetId: string; body: PolygonFeatureCreate }>({
    mutationFn: ({ datasetId, body }) => createPolygonFeature(datasetId, body),
    onSuccess: (_data, { datasetId }) => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.detail(datasetId) });
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}
