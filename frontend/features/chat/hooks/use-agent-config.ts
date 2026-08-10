import { useQuery } from "@tanstack/react-query";
import { getAgentConfig } from "@/features/chat/api";

export function useAgentConfig() {
  return useQuery({
    queryKey: ["agent-config"],
    queryFn: getAgentConfig,
    staleTime: Infinity,
  });
}
