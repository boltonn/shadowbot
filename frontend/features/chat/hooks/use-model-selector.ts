import { useAgentConfig } from "@/features/chat/hooks/use-agent-config";
import { useModelSelectorStore } from "@/features/chat/store";

/** The active model for chat requests — the user's saved choice if still valid, else the server default. */
export function useModelSelector() {
  const { data: agentConfig } = useAgentConfig();
  const modelId = useModelSelectorStore((state) => state.modelId);
  const setModelId = useModelSelectorStore((state) => state.setModelId);

  const models = agentConfig?.models ?? [];
  const resolvedModelId =
    (modelId && models.some((model) => model.id === modelId) ? modelId : undefined) ??
    agentConfig?.defaultModelId;
  const model = models.find((m) => m.id === resolvedModelId);

  return { models, model, modelId: resolvedModelId, setModelId };
}
