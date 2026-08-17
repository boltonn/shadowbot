import { create } from "zustand";
import { persist } from "zustand/middleware";

type ModelSelectorState = {
  modelId: string | null;
  setModelId: (modelId: string) => void;
};

export const useModelSelectorStore = create<ModelSelectorState>()(
  persist(
    (set) => ({
      modelId: null,
      setModelId: (modelId) => set({ modelId }),
    }),
    { name: "shadowbot:model-id" },
  ),
);
