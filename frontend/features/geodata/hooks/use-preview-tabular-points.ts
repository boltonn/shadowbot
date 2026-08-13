import { useMutation } from "@tanstack/react-query";
import { previewTabularPoints } from "@/features/geodata/api";

export function usePreviewTabularPoints() {
  return useMutation({
    mutationFn: (file: File) => previewTabularPoints(file),
  });
}
