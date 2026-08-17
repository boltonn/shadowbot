import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ApiKeyState = {
  apiKey: string;
  dialogOpen: boolean;
  setApiKey: (apiKey: string) => void;
  openDialog: () => void;
  setDialogOpen: (dialogOpen: boolean) => void;
};

// Only the key itself is persisted, and to sessionStorage rather than localStorage,
// so it doesn't outlive the tab.
export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set) => ({
      apiKey: "",
      dialogOpen: false,
      setApiKey: (apiKey) => set({ apiKey }),
      openDialog: () => set({ dialogOpen: true }),
      setDialogOpen: (dialogOpen) => set({ dialogOpen }),
    }),
    {
      name: "shadowbot:llm-api-key",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ apiKey: state.apiKey }),
    },
  ),
);
