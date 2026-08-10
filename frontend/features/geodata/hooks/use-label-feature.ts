import { useMutation, useQueryClient } from "@tanstack/react-query";
import { labelPointFeature, labelPolygonFeature, labelTrackPoint } from "@/features/geodata/api";
import type { LabelFeatureRequest, LabelTrackPointRequest, PointFeature, PolygonFeature } from "@/features/geodata/types";

/** Label a point or polygon feature's category, name, and tags. */
export function useLabelFeature(geometryKind: "point" | "polygon") {
  const queryClient = useQueryClient();
  const labelFn = geometryKind === "point" ? labelPointFeature : labelPolygonFeature;

  return useMutation<
    PointFeature | PolygonFeature,
    Error,
    { datasetId: string; featureId: string; body: LabelFeatureRequest }
  >({
    mutationFn: ({
      datasetId,
      featureId,
      body,
    }: {
      datasetId: string;
      featureId: string;
      body: LabelFeatureRequest;
    }) => labelFn(datasetId, featureId, body),
    onSuccess: (_data, { datasetId }) => {
      queryClient.invalidateQueries({ queryKey: ["datasets", datasetId] });
    },
  });
}

/** Label a track point's tags (track points have no category/name). */
export function useLabelTrackPoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      trackId,
      pointId,
      body,
    }: {
      trackId: string;
      pointId: string;
      body: LabelTrackPointRequest;
    }) => labelTrackPoint(trackId, pointId, body),
    onSuccess: (_data, { trackId }) => {
      queryClient.invalidateQueries({ queryKey: ["datasets", trackId] });
    },
  });
}
