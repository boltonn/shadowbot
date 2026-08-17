import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadPointDataset } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";

type UploadPointDatasetInput = {
  name: string;
  file: File;
  categorySource: { typeField: string } | { defaultType: string };
  latLonFields?: { latField: string; lonField: string };
};

export function useUploadPointDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, file, categorySource, latLonFields }: UploadPointDatasetInput) =>
      uploadPointDataset(name, file, categorySource, latLonFields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}
