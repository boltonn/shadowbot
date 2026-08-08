import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadTrack } from "@/features/geodata/api";

export function useUploadTrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => uploadTrack(name, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    },
  });
}
