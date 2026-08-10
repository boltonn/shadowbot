import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bulkTagPointFeatures, bulkTagPolygonFeatures, bulkTagTrackPoints } from "@/features/geodata/api";
import type { BulkTagRequest, DatasetGeometryKind, PointFeature, PolygonFeature, TrackPoint } from "@/features/geodata/types";

type BulkTagResult = PointFeature[] | PolygonFeature[] | TrackPoint[];

const bulkTagByKind = {
  point: bulkTagPointFeatures,
  polygon: bulkTagPolygonFeatures,
  track: bulkTagTrackPoints,
} as const satisfies Record<DatasetGeometryKind, (datasetId: string, body: BulkTagRequest) => Promise<BulkTagResult>>;

export function useBulkTagFeatures(geometryKind: DatasetGeometryKind) {
  const queryClient = useQueryClient();
  const bulkTagFn = bulkTagByKind[geometryKind];

  return useMutation<BulkTagResult, Error, { datasetId: string; body: BulkTagRequest }>({
    mutationFn: ({ datasetId, body }) => bulkTagFn(datasetId, body),
    onSuccess: (_data, { datasetId }) => {
      queryClient.invalidateQueries({ queryKey: ["datasets", datasetId] });
    },
  });
}
