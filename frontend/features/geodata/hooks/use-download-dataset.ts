import { useMutation } from "@tanstack/react-query";
import { downloadDataset } from "@/features/geodata/api";

export function useDownloadDataset() {
  return useMutation({
    mutationFn: ({ datasetId, name }: { datasetId: string; name: string }) => downloadDataset(datasetId, name),
  });
}
