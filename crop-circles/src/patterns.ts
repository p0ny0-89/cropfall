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
    { points: dot(0, 0, 3.2), tStart: 0.0, tEnd: 0.22, orb: 0 },
    { points: circle(0, 0, 8), tStart: 0.12, tEnd: 0.5, orb: 1 },
    { points: circle(0, 0, 13), tStart: 0.3, tEnd: 0.72, orb: 2 },
    { points: circle(0, 0, 18.5), tStart: 0.5, tEnd: 1.0, orb: 3 },
  ];
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

export const PATTERNS: Pattern[] = [
  classicRings(),
  spiralPattern(),
  mandala(),
  radial(),
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

interface Sample {
  x: number;
  z: number;
  t: number; // global carve time
  tx: number; // unit tangent
  tz: number;
}

// For each stalk: nearest stroke sample → flatten amount, arrival time, and a
// woven brush direction. A uniform grid keeps this near-O(n) so it stays fast
// even with tens of thousands of dense stalks.
export function computeCarve(
  positions: Float32Array, // x,z interleaved per stalk
  count: number,
  pattern: Pattern,
  rand: Float32Array
): CarveData {
  const flatten = new Float32Array(count);
  const carveT = new Float32Array(count);
  const dirX = new Float32Array(count);
  const dirZ = new Float32Array(count);
  const r = pattern.radius;
  const rInner = r * 0.35;

  // flatten strokes into a sample list with tangents + arrival time
  const samples: Sample[] = [];
  for (const s of pattern.strokes) {
    const pts = s.points;
    const m = pts.length;
    for (let j = 0; j < m; j++) {
      const t = s.tStart + (s.tEnd - s.tStart) * (j / Math.max(1, m - 1));
      const k = j < m - 1 ? j + 1 : j - 1;
      let tx = pts[k][0] - pts[j][0];
      let tz = pts[k][1] - pts[j][1];
      if (j === m - 1) {
        tx = -tx;
        tz = -tz;
      }
      const tl = Math.hypot(tx, tz) || 1;
      samples.push({ x: pts[j][0], z: pts[j][1], t, tx: tx / tl, tz: tz / tl });
    }
  }

  // spatial grid (cell ~ carve radius → only 3×3 cells need checking)
  const cell = Math.max(0.6, r);
  const grid = new Map<number, number[]>();
  const GW = 4096; // hash stride
  const key = (cx: number, cz: number) => (cx + 2048) * GW + (cz + 2048);
  for (let s = 0; s < samples.length; s++) {
    const cx = Math.floor(samples[s].x / cell);
    const cz = Math.floor(samples[s].z / cell);
    const kk = key(cx, cz);
    let a = grid.get(kk);
    if (!a) grid.set(kk, (a = []));
    a.push(s);
  }

  for (let i = 0; i < count; i++) {
    const px = positions[i * 2];
    const pz = positions[i * 2 + 1];
    const cx = Math.floor(px / cell);
    const cz = Math.floor(pz / cell);
    let best = Infinity;
    let bt = 0;
    let btx = 1;
    let btz = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const a = grid.get(key(cx + ox, cz + oz));
        if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const s = samples[a[q]];
          const dx = px - s.x;
          const dz = pz - s.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < best) {
            best = d2;
            bt = s.t;
            btx = s.tx;
            btz = s.tz;
          }
        }
      }
    }

    const d = Math.sqrt(best);
    let f = 1 - (d - rInner) / (r - rInner);
    f = Math.max(0, Math.min(1, f));
    f = f * f * (3 - 2 * f); // smoothstep
    flatten[i] = f;
    carveT[i] = bt;

    // weave: alternating concentric bands lay in crossing directions, plus a
    // per-stalk jitter — mimics the layered crisscross of real crop circles.
    const dc = Math.hypot(px, pz);
    const band = Math.floor(dc / 1.7);
    const layer = band % 2 === 0 ? 1 : -1;
    let ang = Math.atan2(btz, btx);
    ang += layer * 0.5 + (rand[i] - 0.5) * 0.6 + Math.sin(dc * 0.85 + bt * 14) * 0.22;
    dirX[i] = Math.cos(ang);
    dirZ[i] = Math.sin(ang);
  }
  return { flatten, carveT, dirX, dirZ };
}

// Distance from a world point to the nearest flattened path, plus the path's
// tangent there. Used to highlight / drop into the downed crop trails.
export function pathHit(
  x: number,
  z: number,
  pattern: Pattern
): { dist: number; tx: number; tz: number } {
  let best = Infinity;
  let btx = 0;
  let btz = 1;
  for (const s of pattern.strokes) {
    const pts = s.points;
    const m = pts.length;
    for (let j = 0; j < m; j++) {
      const dx = x - pts[j][0];
      const dz = z - pts[j][1];
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        const k = j < m - 1 ? j + 1 : j - 1;
        let tx = pts[k][0] - pts[j][0];
        let tz = pts[k][1] - pts[j][1];
        if (j === m - 1) {
          tx = -tx;
          tz = -tz;
        }
        const tl = Math.hypot(tx, tz) || 1;
        btx = tx / tl;
        btz = tz / tl;
      }
    }
  }
  return { dist: Math.sqrt(best), tx: btx, tz: btz };
}

// ===========================================================================
// Formation Lab — procedural generators
// ---------------------------------------------------------------------------
// Every generator emits the shared UNIVERSAL FORMAT: a list of paths, where a
// path is an array of { x, z } points. `buildPattern` then converts that into
// the same `Pattern` shape the presets use, so the orb animation and crop
// flattening pipeline is reused verbatim — generators never touch it.
//
// (A future "Draw Glyph" mode just needs to output FormationPaths from a 2D
//  sketch and call buildPattern — no other changes required.)
// ===========================================================================

export type FormationPoint = { x: number; z: number };
export type FormationPaths = FormationPoint[][];
export type PatternType = "rings" | "spiral" | "radial" | "mandala";

export interface CustomSettings {
  patternType: PatternType;
  radius: number; // overall size
  lineWidth: number; // flattened-path thickness (-> Pattern.radius)
  complexity: number; // rings=ring count, spiral=turns, radial=cross-rings, mandala=layers
  symmetry: number; // radial duplication: 3,4,6,8,12,16
  rotation: number; // radians, around field centre
  noise: number; // organic distortion amount
  orbCount: number; // how many orbs carve it (1..NUM_ORBS)
}

export const SYMMETRY_VALUES = [3, 4, 6, 8, 12, 16];
export const MAX_FORMATION_R = 22;

export const DEFAULT_CUSTOM: CustomSettings = {
  patternType: "mandala",
  radius: 17,
  lineWidth: 1.3,
  complexity: 4,
  symmetry: 8,
  rotation: 0,
  noise: 0.4,
  orbCount: 4,
};

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function circlePts(cx: number, cz: number, r: number, segs = 64): FormationPoint[] {
  const pts: FormationPoint[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return pts;
}

function linePts(x0: number, z0: number, x1: number, z1: number, segs = 24): FormationPoint[] {
  const pts: FormationPoint[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
  }
  return pts;
}

// -- generators (each returns FormationPaths) -------------------------------

export function generateRings(s: CustomSettings): FormationPaths {
  const rings = clampN(Math.round(s.complexity), 1, 8);
  const paths: FormationPaths = [];
  for (let k = 1; k <= rings; k++) {
    const r = (s.radius * k) / rings;
    paths.push(circlePts(0, 0, r, Math.max(48, Math.round(r * 9))));
  }
  return paths;
}

export function generateSpiral(s: CustomSettings): FormationPaths {
  const arms = clampN(Math.round(s.symmetry), 1, 16);
  const turns = clampN(s.complexity, 1, 8);
  const paths: FormationPaths = [];
  const segs = Math.max(90, Math.round(turns * 70));
  for (let a = 0; a < arms; a++) {
    const off = (a / arms) * Math.PI * 2;
    const pts: FormationPoint[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ang = off + t * turns * Math.PI * 2;
      const r = t * s.radius;
      pts.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r });
    }
    paths.push(pts);
  }
  return paths;
}

export function generateRadial(s: CustomSettings): FormationPaths {
  const arms = clampN(Math.round(s.symmetry), 3, 16);
  const rings = clampN(Math.round(s.complexity), 0, 6); // concentric cross-rings
  const paths: FormationPaths = [];
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2;
    paths.push(
      linePts(0, 0, Math.cos(ang) * s.radius, Math.sin(ang) * s.radius, Math.max(24, Math.round(s.radius * 2)))
    );
  }
  for (let j = 1; j <= rings; j++) {
    const r = (s.radius * j) / (rings + 1);
    paths.push(circlePts(0, 0, r, Math.max(48, Math.round(r * 9))));
  }
  return paths;
}

export function generateMandala(s: CustomSettings): FormationPaths {
  const sym = clampN(Math.round(s.symmetry), 3, 16);
  const layers = clampN(Math.round(s.complexity), 1, 8);
  const paths: FormationPaths = [];
  paths.push(circlePts(0, 0, s.radius * 0.12, 40)); // hub
  for (let j = 1; j <= layers; j++) {
    const r = (s.radius * j) / layers;
    paths.push(circlePts(0, 0, r, Math.max(48, Math.round(r * 9))));
  }
  const petalR = s.radius * 0.55;
  const petalSize = s.radius * 0.16;
  for (let i = 0; i < sym; i++) {
    const a = (i / sym) * Math.PI * 2;
    paths.push(circlePts(Math.cos(a) * petalR, Math.sin(a) * petalR, petalSize, 40));
  }
  for (let i = 0; i < sym; i++) {
    const a = (i / sym) * Math.PI * 2;
    paths.push(
      linePts(Math.cos(a) * s.radius * 0.18, Math.sin(a) * s.radius * 0.18, Math.cos(a) * s.radius, Math.sin(a) * s.radius)
    );
  }
  return paths;
}

// -- transforms (operate on flat point arrays) ------------------------------

export function applyRotation(points: FormationPoint[], rotation: number): FormationPoint[] {
  if (!rotation) return points;
  const c = Math.cos(rotation);
  const sn = Math.sin(rotation);
  return points.map((p) => ({ x: p.x * c - p.z * sn, z: p.x * sn + p.z * c }));
}

// Smooth, deterministic perpendicular wobble — readable but less "computer
// perfect". Same settings (same seed) always give the same shape.
export function applyOrganicNoise(
  points: FormationPoint[],
  amount: number,
  seed = 0
): FormationPoint[] {
  if (amount <= 0 || points.length < 2) return points;
  const last = points.length - 1;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(last, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const n = Math.sin(i * 0.35 + seed) * 0.6 + Math.sin(i * 0.13 + seed * 2.1 + 1.7) * 0.4;
    const d = n * amount;
    return { x: p.x - tz * d, z: p.z + tx * d }; // displace along the normal
  });
}

export function normalizeFormationPoints(points: FormationPoint[]): FormationPoint[] {
  return points.map((p) => {
    const d = Math.hypot(p.x, p.z);
    if (d > MAX_FORMATION_R) {
      const k = MAX_FORMATION_R / d;
      return { x: p.x * k, z: p.z * k };
    }
    return p;
  });
}

export const formationGenerators: Record<PatternType, (s: CustomSettings) => FormationPaths> = {
  rings: generateRings,
  spiral: generateSpiral,
  radial: generateRadial,
  mandala: generateMandala,
};

export function generateCustomFormation(s: CustomSettings): FormationPaths {
  const seed = s.complexity * 131.1 + s.symmetry * 17.7 + s.rotation * 53.3 + s.patternType.length * 7;
  const base = (formationGenerators[s.patternType] ?? generateMandala)(s);
  return base.map((path) => {
    let q = applyRotation(path, s.rotation);
    q = applyOrganicNoise(q, s.noise, seed);
    q = normalizeFormationPoints(q);
    return q;
  });
}

// -- universal: paths -> Pattern (shared with the presets' pipeline) --------

// Auto-schedules paths across orbs and the formation timeline. Inner/earlier
// paths carve first; up to `orbCount` paths carve in parallel per wave.
export function buildPattern(
  id: string,
  label: string,
  paths: FormationPaths,
  lineWidth: number,
  orbCount: number
): Pattern {
  const valid = paths.filter((p) => p.length > 1);
  const K = clampN(Math.round(orbCount), 1, NUM_ORBS);
  const waves = Math.max(1, Math.ceil(valid.length / K));
  const strokes: Stroke[] = valid.map((p, i) => {
    const wave = Math.floor(i / K);
    return {
      points: p.map((q) => [q.x, q.z] as Vec2),
      tStart: wave / waves,
      tEnd: (wave + 1) / waves,
      orb: i % K,
    };
  });
  return { id, label, strokes, radius: lineWidth };
}

export function buildCustomPattern(settings: CustomSettings): Pattern {
  return buildPattern(
    "custom",
    "Formation Lab",
    generateCustomFormation(settings),
    settings.lineWidth,
    settings.orbCount
  );
}
