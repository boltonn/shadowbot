import { apiClient } from "@/lib/api-client";
import type { AgentConfig } from "@/features/chat/types";

export async function getAgentConfig(): Promise<AgentConfig> {
  const response = await apiClient.get<AgentConfig>("/agent/config");
  return response.data;
}
