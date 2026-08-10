import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadPolygonDataset } from "@/features/geodata/api";

type UploadPolygonDatasetInput = {
  name: string;
  file: File;
  categorySource: { typeField: string } | { defaultType: string };
};

export function useUploadPolygonDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, file, categorySource }: UploadPolygonDatasetInput) =>
      uploadPolygonDataset(name, file, categorySource),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}
