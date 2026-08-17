import type { DatasetGeometryKind } from "@/features/geodata/types";

/** Single source of truth for dataset query keys — shared between query hooks and mutation invalidation. */
export const datasetKeys = {
  all: ["datasets"] as const,
  list: (params?: { page?: number; limit?: number; geometryKind?: DatasetGeometryKind }) =>
    [...datasetKeys.all, params] as const,
  detail: (datasetId: string) => [...datasetKeys.all, datasetId] as const,
};
