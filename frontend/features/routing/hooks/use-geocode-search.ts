import { useMutation } from "@tanstack/react-query";
import { geocode } from "@/features/routing/api";

export function useGeocodeSearch() {
  return useMutation({
    mutationFn: geocode,
  });
}
