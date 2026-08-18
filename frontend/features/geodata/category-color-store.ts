import { create } from "zustand";
import { persist } from "zustand/middleware";

type CategoryColorState = {
  /** category (lowercased) -> user-chosen hex color, overriding the deterministic default. */
  overrides: Record<string, string>;
  /** location id -> user-chosen hex color, overriding that one point's category color. */
  locationOverrides: Record<string, string>;
  setCategoryColor: (category: string, hex: string) => void;
  resetCategoryColor: (category: string) => void;
  setLocationColor: (id: string, hex: string) => void;
  resetLocationColor: (id: string) => void;
};

export const useCategoryColorStore = create<CategoryColorState>()(
  persist(
    (set) => ({
      overrides: {},
      locationOverrides: {},
      setCategoryColor: (category, hex) =>
        set((state) => ({ overrides: { ...state.overrides, [category.toLowerCase()]: hex } })),
      resetCategoryColor: (category) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[category.toLowerCase()];
          return { overrides: next };
        }),
      setLocationColor: (id, hex) =>
        set((state) => ({ locationOverrides: { ...state.locationOverrides, [id]: hex } })),
      resetLocationColor: (id) =>
        set((state) => {
          const next = { ...state.locationOverrides };
          delete next[id];
          return { locationOverrides: next };
        }),
    }),
    { name: "shadowbot:category-colors" },
  ),
);
