import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadPointDataset } from "@/features/geodata/api";

type UploadPointDatasetInput = {
  name: string;
  file: File;
  categorySource: { typeField: string } | { defaultType: string };
};

export function useUploadPointDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, file, categorySource }: UploadPointDatasetInput) =>
      uploadPointDataset(name, file, categorySource),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}
