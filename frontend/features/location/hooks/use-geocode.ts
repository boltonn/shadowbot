import { useMutation } from "@tanstack/react-query";
import { geocode } from "@/features/location/api";

export function useGeocode() {
  return useMutation({ mutationFn: geocode });
}
