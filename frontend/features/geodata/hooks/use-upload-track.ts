import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadTrack } from "@/features/geodata/api";
import { datasetKeys } from "@/features/geodata/query-keys";

export function useUploadTrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => uploadTrack(name, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: datasetKeys.all });
    },
  });
}
