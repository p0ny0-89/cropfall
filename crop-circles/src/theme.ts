// Two color/atmosphere palettes. The scene smoothly lerps between them so
// switching feels like dusk falling rather than a hard cut.

export interface Palette {
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;

  hemiSky: string;
  hemiGround: string;
  hemiInt: number;
  ambientColor: string;
  ambientInt: number;
  dirColor: string;
  dirInt: number;

  bladeA: string;
  bladeB: string;
  bladeFlatA: string;
  bladeFlatB: string;
  groundColor: string;
  pollen: string;

  orbCore: string;
  orbHalo: string;
  orbLight: string;
  orbBeam: string;

  windAmp: number;
  moon: number; // moon disc visibility 0..1
}

export const DAY: Palette = {
  background: "#c5a466",
  // fog == background so distant crops and sky merge — no visible horizon line
  fogColor: "#c5a466",
  fogNear: 18,
  fogFar: 80,

  hemiSky: "#fff0cf",
  hemiGround: "#5a4a26",
  hemiInt: 0.85,
  ambientColor: "#ffe9c4",
  ambientInt: 0.28,
  dirColor: "#ffdca0",
  dirInt: 1.7,

  bladeA: "#a98c2d",
  bladeB: "#cdaf4c",
  bladeFlatA: "#c6a956",
  bladeFlatB: "#e4cd83",
  groundColor: "#a98a47",
  pollen: "#ffe6ad",

  orbCore: "#fff4d6",
  orbHalo: "#ffcf7a",
  orbLight: "#ffd592",
  orbBeam: "#ffdf9e",

  windAmp: 0.32,
  moon: 0,
};

export const NIGHT: Palette = {
  background: "#1c1e40",
  fogColor: "#1c1e40",
  fogNear: 16,
  fogFar: 76,

  hemiSky: "#8c9ce0",
  hemiGround: "#13142e",
  hemiInt: 0.78,
  ambientColor: "#454d80",
  ambientInt: 0.42,
  dirColor: "#c6d1f6",
  dirInt: 1.2,

  bladeA: "#414b80",
  bladeB: "#5e6cab",
  bladeFlatA: "#8694d2",
  bladeFlatB: "#b8c2ef",
  groundColor: "#454f8c",
  pollen: "#d6dfff",

  orbCore: "#eef3ff",
  orbHalo: "#aebfff",
  orbLight: "#b9ccff",
  orbBeam: "#cad6ff",

  windAmp: 0.26,
  moon: 1,
};

export function paletteFor(theme: "day" | "night"): Palette {
  return theme === "night" ? NIGHT : DAY;
}
