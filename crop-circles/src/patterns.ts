// Pattern geometry + carve scheduling.
//
// A pattern is a set of "strokes" — polylines in the XZ ground plane that the
// orbs physically trace. As an orb passes over a stalk, the stalk flattens.
// Because the orbs follow the exact same strokes used to compute which stalks
// flatten (and *when*), the formation reads as if the orbs are carving it.

export type Vec2 = [number, number];

export interface Stroke {
  points: Vec2[]; // sampled world-space points along the path
  tStart: number; // global formation-progress window [0..1]
  tEnd: number;
  orb: number; // which orb traces this stroke
}

export interface Pattern {
  id: string;
  label: string;
  strokes: Stroke[];
  radius: number; // carve half-width in world units
}

export const FIELD_RADIUS = 26;
export const NUM_ORBS = 4;

// ---- stroke builders -------------------------------------------------------

function circle(cx: number, cz: number, r: number, segs = 160): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

function arc(cx: number, cz: number, r: number, a0: number, a1: number, segs = 80): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

function line(x0: number, z0: number, x1: number, z1: number, segs = 40): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return pts;
}

function spiral(turns: number, rMax: number, segs = 420): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const r = t * rMax;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function dot(cx: number, cz: number, r: number): Vec2[] {
  // tiny tight spiral to flatten a filled disc
  const pts: Vec2[] = [];
  const rings = Math.max(2, Math.round(r / 0.6));
  for (let k = rings; k >= 0; k--) {
    const rr = (k / rings) * r;
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return pts;
}

// ---- patterns --------------------------------------------------------------

function classicRings(): Pattern {
  const strokes: Stroke[] = [
    { points: dot(0, 0, 3.2), tStart: 0.0, tEnd: 0.22, orb: 0, radius: 0 } as any,
    { points: circle(0, 0, 8), tStart: 0.12, tEnd: 0.5, orb: 1 } as any,
    { points: circle(0, 0, 13), tStart: 0.3, tEnd: 0.72, orb: 2 } as any,
    { points: circle(0, 0, 18.5), tStart: 0.5, tEnd: 1.0, orb: 3 } as any,
  ].map((s) => ({ points: s.points, tStart: s.tStart, tEnd: s.tEnd, orb: s.orb }));
  return { id: "rings", label: "Classic Rings", strokes, radius: 1.5 };
}

function spiralPattern(): Pattern {
  const full = spiral(4.5, 20);
  // split the spiral across orbs in sequential chunks so several orbs share work
  const strokes: Stroke[] = [];
  const chunks = 4;
  const n = full.length;
  for (let c = 0; c < chunks; c++) {
    const a = Math.floor((c / chunks) * n);
    const b = Math.floor(((c + 1) / chunks) * n) + 1;
    strokes.push({
      points: full.slice(a, b),
      tStart: c / chunks,
      tEnd: (c + 1) / chunks,
      orb: c % NUM_ORBS,
    });
  }
  return { id: "spiral", label: "Spiral", strokes, radius: 1.35 };
}

function mandala(): Pattern {
  const strokes: Stroke[] = [];
  strokes.push({ points: dot(0, 0, 2.2), tStart: 0, tEnd: 0.14, orb: 0 });
  strokes.push({ points: circle(0, 0, 6), tStart: 0.1, tEnd: 0.32, orb: 1 });
  // ring of petal circles
  const petals = 8;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const cx = Math.cos(a) * 11;
    const cz = Math.sin(a) * 11;
    strokes.push({
      points: circle(cx, cz, 4),
      tStart: 0.28 + (i / petals) * 0.4,
      tEnd: 0.46 + (i / petals) * 0.4,
      orb: i % NUM_ORBS,
    });
  }
  strokes.push({ points: circle(0, 0, 19), tStart: 0.8, tEnd: 1.0, orb: 0 });
  return { id: "mandala", label: "Mandala", strokes, radius: 1.1 };
}

function radial(): Pattern {
  const strokes: Stroke[] = [];
  strokes.push({ points: dot(0, 0, 2), tStart: 0, tEnd: 0.12, orb: 0 });
  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    strokes.push({
      points: line(0, 0, Math.cos(a) * 19, Math.sin(a) * 19),
      tStart: 0.1 + (i / spokes) * 0.45,
      tEnd: 0.3 + (i / spokes) * 0.45,
      orb: i % NUM_ORBS,
    });
  }
  // outer triangle
  const tri: Vec2[] = [];
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    tri.push([Math.cos(a) * 20, Math.sin(a) * 20]);
  }
  const triPath: Vec2[] = [];
  for (let i = 0; i < 3; i++) triPath.push(...line(tri[i][0], tri[i][1], tri[i + 1][0], tri[i + 1][1]));
  strokes.push({ points: triPath, tStart: 0.7, tEnd: 1.0, orb: 1 });
  return { id: "radial", label: "Radial", strokes, radius: 1.25 };
}

function glyph(): Pattern {
  // abstract: crescent + central disc + two satellite discs + connecting arc
  const strokes: Stroke[] = [];
  strokes.push({ points: dot(0, 0, 3.5), tStart: 0, tEnd: 0.2, orb: 0 });
  strokes.push({ points: arc(0, 0, 14, Math.PI * 0.15, Math.PI * 1.15), tStart: 0.15, tEnd: 0.5, orb: 1 });
  strokes.push({ points: arc(0, 0, 11, Math.PI * 0.25, Math.PI * 1.05), tStart: 0.3, tEnd: 0.62, orb: 2 });
  strokes.push({ points: dot(-13, 7, 2.4), tStart: 0.55, tEnd: 0.74, orb: 3 });
  strokes.push({ points: dot(12, 9, 2.4), tStart: 0.6, tEnd: 0.8, orb: 0 });
  strokes.push({ points: line(-13, 7, 12, 9), tStart: 0.78, tEnd: 1.0, orb: 1 });
  return { id: "glyph", label: "Glyph", strokes, radius: 1.2 };
}

export const PATTERNS: Pattern[] = [
  classicRings(),
  spiralPattern(),
  mandala(),
  radial(),
  glyph(),
];

export function getPattern(id: string): Pattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

// ---- carve computation -----------------------------------------------------

export interface CarveData {
  flatten: Float32Array; // target flatten amount 0..1 per stalk
  carveT: Float32Array; // global time the stalk is reached 0..1
  dirX: Float32Array; // unit brush direction
  dirZ: Float32Array;
}

// For each stalk, find the nearest stroke sample → flatten amount, the time the
// orb reaches it, and the brush direction (stroke tangent → swirled look).
export function computeCarve(
  positions: Float32Array, // x,z interleaved per stalk
  count: number,
  pattern: Pattern
): CarveData {
  const flatten = new Float32Array(count);
  const carveT = new Float32Array(count);
  const dirX = new Float32Array(count);
  const dirZ = new Float32Array(count);
  const r = pattern.radius;
  const rInner = r * 0.35;

  for (let i = 0; i < count; i++) {
    const px = positions[i * 2];
    const pz = positions[i * 2 + 1];
    let best = Infinity;
    let bestT = 0;
    let bestDx = 0;
    let bestDz = 0;
    for (const s of pattern.strokes) {
      const pts = s.points;
      const m = pts.length;
      for (let j = 0; j < m; j++) {
        const dx = px - pts[j][0];
        const dz = pz - pts[j][1];
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
          best = d2;
          bestT = s.tStart + (s.tEnd - s.tStart) * (j / Math.max(1, m - 1));
          // tangent
          const k = j < m - 1 ? j + 1 : j - 1;
          let tx = pts[k][0] - pts[j][0];
          let tz = pts[k][1] - pts[j][1];
          if (j === m - 1) {
            tx = -tx;
            tz = -tz;
          }
          const tl = Math.hypot(tx, tz) || 1;
          bestDx = tx / tl;
          bestDz = tz / tl;
        }
      }
    }
    const d = Math.sqrt(best);
    // soft-edged carve channel
    let f = 1 - (d - rInner) / (r - rInner);
    f = Math.max(0, Math.min(1, f));
    f = f * f * (3 - 2 * f); // smoothstep
    flatten[i] = f;
    carveT[i] = bestT;
    dirX[i] = bestDx;
    dirZ[i] = bestDz;
  }
  return { flatten, carveT, dirX, dirZ };
}
