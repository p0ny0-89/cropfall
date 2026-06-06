import { create } from "zustand";
import {
  PATTERNS,
  getPattern,
  buildCustomPattern,
  buildPattern,
  NUM_ORBS,
  DEFAULT_CUSTOM,
  type Pattern,
  type CustomSettings,
  type FormationPaths,
} from "./patterns";
import { fpLive } from "./fpLive";
import { clearShareHash } from "./share";

export type Phase = "intro" | "forming" | "explore";
export type Theme = "day" | "night";
export type ViewMode = "aerial" | "fp";

interface State {
  patternId: string; // preset id, or "custom" for Formation Lab
  phase: Phase;
  theme: Theme;
  cropColor: string | null; // custom crop hue; null = follow the theme default
  drawOpen: boolean; // the "draw your own" modal
  sound: boolean; // ambience on/off
  mode: ViewMode; // aerial orbit vs first-person street view
  fpStart: { x: number; z: number; yaw: number }; // where a drop-in begins
  formProgress: number; // 0..1 carve progress, drives the shader reveal
  // The single resolved formation everything downstream consumes (presets and
  // custom alike) — orbs, crop flattening, hover/drop and the minimap all read
  // this, so there is one pipeline regardless of where the pattern came from.
  activePattern: Pattern;
  customSettings: CustomSettings;
  selectPattern: (id: string) => void;
  // carve an arbitrary hand-drawn / shared doodle (field-space paths + brush)
  carveDrawing: (paths: FormationPaths, radius?: number) => void;
  setPhase: (p: Phase) => void;
  setProgress: (n: number) => void;
  reform: () => void;
  toggleTheme: () => void;
  setCropColor: (c: string | null) => void;
  setDrawOpen: (b: boolean) => void;
  toggleSound: () => void;
  enterFirstPerson: (x: number, z: number, yaw: number) => void;
  exitFirstPerson: () => void;
  updateCustom: (partial: Partial<CustomSettings>) => void;
  // a token that increments whenever a fresh formation should start
  formToken: number;
}

const resolve = (id: string, settings: CustomSettings): Pattern =>
  id === "custom" ? buildCustomPattern(settings) : getPattern(id);

export const useStore = create<State>((set, get) => ({
  patternId: PATTERNS[0].id,
  phase: "intro",
  // night is the default: you first witness the formation being carved
  // overnight, then can switch to day to see it the morning after.
  theme: "night",
  cropColor: null,
  drawOpen: false,
  sound: false,
  mode: "aerial",
  fpStart: { x: 0, z: 0, yaw: 0 },
  formProgress: 0,
  formToken: 0,
  customSettings: DEFAULT_CUSTOM,
  activePattern: getPattern(PATTERNS[0].id),
  toggleTheme: () => set((s) => ({ theme: s.theme === "day" ? "night" : "day" })),
  setCropColor: (c) => set({ cropColor: c }),
  setDrawOpen: (b) => set({ drawOpen: b }),
  toggleSound: () => set((s) => ({ sound: !s.sound })),
  selectPattern: (id) => {
    if (id === get().patternId && get().phase === "forming") return;
    clearShareHash(); // leaving a shared/drawn formation; don't let a refresh restore it
    set((s) => ({
      patternId: id,
      activePattern: resolve(id, s.customSettings),
      mode: "aerial",
      phase: "intro",
      formProgress: 0,
      formToken: s.formToken + 1,
    }));
  },
  carveDrawing: (paths, radius = 1.3) =>
    set((s) => ({
      activePattern: buildPattern("drawn", "Your Drawing", paths, radius, NUM_ORBS),
      patternId: "drawn",
      mode: "aerial",
      phase: "intro",
      formProgress: 0,
      formToken: s.formToken + 1,
    })),
  reform: () =>
    set((s) => ({
      // rebuild custom from the latest lab settings; presets stay as-is; a
      // hand-drawn formation is preserved (re-carved as the same drawing)
      activePattern: s.patternId === "drawn" ? s.activePattern : resolve(s.patternId, s.customSettings),
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
  // Store-only: lab edits wait for Reform Field before rebuilding the pattern.
  updateCustom: (partial) =>
    set((s) => ({ customSettings: { ...s.customSettings, ...partial } })),
}));
