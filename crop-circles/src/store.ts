import { create } from "zustand";
import { PATTERNS } from "./patterns";
import { fpLive } from "./fpLive";

export type Phase = "intro" | "forming" | "explore";
export type Theme = "day" | "night";
export type ViewMode = "aerial" | "fp";

interface State {
  patternId: string;
  phase: Phase;
  theme: Theme;
  mode: ViewMode; // aerial orbit vs first-person street view
  fpStart: { x: number; z: number; yaw: number }; // where a drop-in begins
  formProgress: number; // 0..1 carve progress, drives the shader reveal
  selectPattern: (id: string) => void;
  setPhase: (p: Phase) => void;
  setProgress: (n: number) => void;
  reform: () => void;
  toggleTheme: () => void;
  enterFirstPerson: (x: number, z: number, yaw: number) => void;
  exitFirstPerson: () => void;
  // a token that increments whenever a fresh formation should start
  formToken: number;
}

export const useStore = create<State>((set, get) => ({
  patternId: PATTERNS[0].id,
  phase: "intro",
  // night is the default: you first witness the formation being carved
  // overnight, then can switch to day to see it the morning after.
  theme: "night",
  mode: "aerial",
  fpStart: { x: 0, z: 0, yaw: 0 },
  formProgress: 0,
  formToken: 0,
  toggleTheme: () => set((s) => ({ theme: s.theme === "day" ? "night" : "day" })),
  selectPattern: (id) => {
    if (id === get().patternId && get().phase === "forming") return;
    set((s) => ({
      patternId: id,
      mode: "aerial",
      phase: "intro",
      formProgress: 0,
      formToken: s.formToken + 1,
    }));
  },
  reform: () =>
    set((s) => ({
      phase: "intro",
      mode: "aerial",
      formProgress: 0,
      formToken: s.formToken + 1,
    })),
  setPhase: (p) => set({ phase: p }),
  setProgress: (n) => set({ formProgress: n }),
  enterFirstPerson: (x, z, yaw) => {
    fpLive.x = x;
    fpLive.z = z;
    fpLive.yaw = yaw;
    set({ mode: "fp", fpStart: { x, z, yaw } });
  },
  exitFirstPerson: () => set({ mode: "aerial" }),
}));
