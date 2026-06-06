// Doodle <-> shareable-URL plumbing.
//
// A drawing is a list of strokes (polylines of normalized [x,y] points in the
// unit square) plus a brush size (the carve half-width in world units). We map
// strokes into the field's XZ plane for carving, and pack the whole drawing
// into a compact URL hash so the link itself carries it (no backend needed on
// GitHub Pages).

import type { FormationPaths } from "./patterns";

export type NPoint = [number, number]; // normalized 0..1
export type NStroke = NPoint[];
export type Drawing = { strokes: NStroke[]; brush: number };

// the field radius a drawing is scaled to fill (< MAX_FORMATION_R = 22)
export const FIT_R = 19;

// normalized unit-square strokes -> field-space paths the carve engine consumes
export function strokesToPaths(strokes: NStroke[]): FormationPaths {
  return strokes
    .filter((s) => s.length > 1)
    .map((s) => s.map(([nx, ny]) => ({ x: (nx - 0.5) * 2 * FIT_R, z: (ny - 0.5) * 2 * FIT_R })));
}

// ---- URL hash codec --------------------------------------------------------
// Bytes: [version=2][brush*40] then per stroke: [count][x,y]*count, coords
// quantized to 8 bits over the unit square. Base64url so it's URL-safe.

const VERSION = 2;
const q8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
const clampByte = (v: number) => Math.max(0, Math.min(255, v));

export function encodeDrawing(strokes: NStroke[], brush: number): string {
  const bytes: number[] = [VERSION, clampByte(Math.round(brush * 40))];
  for (const s of strokes) {
    if (s.length < 2) continue;
    const pts = s.slice(0, 255);
    bytes.push(pts.length);
    for (const [x, y] of pts) bytes.push(q8(x), q8(y));
  }
  return toB64Url(Uint8Array.from(bytes));
}

export function decodeDrawing(str: string): Drawing | null {
  try {
    const bytes = fromB64Url(str);
    const v = bytes[0];
    let i = 1;
    let brush = 1.3;
    if (v === 2) brush = (bytes[i++] || 52) / 40;
    else if (v !== 1) return null; // v1: strokes only, default brush
    const strokes: NStroke[] = [];
    while (i < bytes.length) {
      const n = bytes[i++];
      const pts: NStroke = [];
      for (let k = 0; k < n && i + 1 < bytes.length; k++) pts.push([bytes[i++] / 255, bytes[i++] / 255]);
      if (pts.length > 1) strokes.push(pts);
    }
    return strokes.length ? { strokes, brush } : null;
  } catch {
    return null;
  }
}

// the full shareable URL for the current origin/base path
export function shareUrlFor(strokes: NStroke[], brush: number): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#d=${encodeDrawing(strokes, brush)}`;
}

// pull a drawing out of the current location hash, if present
export function drawingFromHash(): Drawing | null {
  const m = window.location.hash.match(/[#&]d=([^&]+)/);
  return m ? decodeDrawing(m[1]) : null;
}

// drop a shared-drawing hash from the URL — call when the formation changes
// away from the drawing, so a refresh doesn't resurrect the old doodle
export function clearShareHash() {
  if (/[#&]d=/.test(window.location.hash)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
