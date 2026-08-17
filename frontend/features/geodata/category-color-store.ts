import { create } from "zustand";
import { persist } from "zustand/middleware";

type CategoryColorState = {
  /** category (lowercased) -> user-chosen hex color, overriding the deterministic default. */
  overrides: Record<string, string>;
  setCategoryColor: (category: string, hex: string) => void;
  resetCategoryColor: (category: string) => void;
};

export const useCategoryColorStore = create<CategoryColorState>()(
  persist(
    (set) => ({
      overrides: {},
      setCategoryColor: (category, hex) =>
        set((state) => ({ overrides: { ...state.overrides, [category.toLowerCase()]: hex } })),
      resetCategoryColor: (category) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[category.toLowerCase()];
          return { overrides: next };
        }),
    }),
    { name: "shadowbot:category-colors" },
  ),
);
