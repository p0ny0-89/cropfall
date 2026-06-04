import { create } from "zustand";
import { PATTERNS } from "./patterns";

export type Phase = "intro" | "forming" | "explore";
export type Theme = "day" | "night";

interface State {
  patternId: string;
  phase: Phase;
  theme: Theme;
  formProgress: number; // 0..1 carve progress, drives the shader reveal
  selectPattern: (id: string) => void;
  setPhase: (p: Phase) => void;
  setProgress: (n: number) => void;
  reform: () => void;
  toggleTheme: () => void;
  // a token that increments whenever a fresh formation should start
  formToken: number;
}

export const useStore = create<State>((set, get) => ({
  patternId: PATTERNS[0].id,
  phase: "intro",
  // night is the default: you first witness the formation being carved
  // overnight, then can switch to day to see it the morning after.
  theme: "night",
  formProgress: 0,
  formToken: 0,
  toggleTheme: () => set((s) => ({ theme: s.theme === "day" ? "night" : "day" })),
  selectPattern: (id) => {
    if (id === get().patternId && get().phase === "forming") return;
    set((s) => ({
      patternId: id,
      phase: "intro",
      formProgress: 0,
      formToken: s.formToken + 1,
    }));
  },
  reform: () =>
    set((s) => ({ phase: "intro", formProgress: 0, formToken: s.formToken + 1 })),
  setPhase: (p) => set({ phase: p }),
  setProgress: (n) => set({ formProgress: n }),
}));
