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
  background: "#dcd6c8",
  // pale haze at the horizon (the field fades into a soft white-ish haze under
  // the blue sky) — fog == sky horizon so the field blends in seamlessly
  fogColor: "#dcd6c8",
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
  groundColor: "#241a0c",
  pollen: "#ffe6ad",

  orbCore: "#fff4d6",
  orbHalo: "#ffcf7a",
  orbLight: "#ffd592",
  orbBeam: "#ffdf9e",

  windAmp: 0.32,
  moon: 0,
};

export const NIGHT: Palette = {
  background: "#3a4690",
  // light-blue moonlit haze at the horizon, falling off to purple overhead.
  // The field colours are kept close to this haze so the crops melt into the
  // horizon (one continuous gradient) rather than reading as a dark band.
  fogColor: "#3a4690",
  fogNear: 12,
  fogFar: 66,

  hemiSky: "#8c9ce0",
  hemiGround: "#13142e",
  hemiInt: 0.78,
  ambientColor: "#454d80",
  ambientInt: 0.42,
  dirColor: "#c6d1f6",
  dirInt: 1.2,

  bladeA: "#515d96",
  bladeB: "#707fbf",
  bladeFlatA: "#99a6dc",
  bladeFlatB: "#c6cff3",
  groundColor: "#0a0e26",
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
