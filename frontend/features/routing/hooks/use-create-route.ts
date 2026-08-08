import { useMutation } from "@tanstack/react-query";
import { createRoute } from "@/features/routing/api";

export function useCreateRoute() {
  return useMutation({
    mutationFn: createRoute,
  });
}
