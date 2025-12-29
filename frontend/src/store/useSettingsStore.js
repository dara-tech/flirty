import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useSettingsStore = create(
  persist(
    (set) => ({
      // Chat bubble style: 'rounded', 'square', 'minimal', 'bordered', 'gradient', 'modern'
      chatBubbleStyle: localStorage.getItem("chat-bubble-style") || "rounded",
      setChatBubbleStyle: (style) => {
        localStorage.setItem("chat-bubble-style", style);
        set({ chatBubbleStyle: style });
      },
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

