import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getDataset } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";

function datasetDetailOptions(datasetId: string) {
  return queryOptions({
    queryKey: datasetKeys.detail(datasetId),
    queryFn: () => getDataset(datasetId),
  });
}

/** For consumers that gate the fetch on some condition (e.g. a dialog's open state). */
export function useDatasetDetail(datasetId: string, enabled: boolean) {
  return useQuery({ ...datasetDetailOptions(datasetId), enabled });
}

/** For consumers that always need the data — suspends instead of returning an undefined `data` while pending. */
export function useSuspenseDatasetDetail(datasetId: string) {
  return useSuspenseQuery(datasetDetailOptions(datasetId));
}
