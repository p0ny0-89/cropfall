import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { strokesToPaths, encodeDrawing, shareUrlFor, FIT_R, type NStroke } from "../share";

const MIN_DIST = 0.012; // min normalized spacing between captured points
// brush = carve half-width in world units; the canvas preview is scaled to match
const BRUSH_SIZES = [0.8, 1.3, 2.0, 2.8];

// bounding-box extent of a stroke (0..1) — used to tell a tap from a drag
function strokeExtent(s: NStroke): number {
  let minx = 1, miny = 1, maxx = 0, maxy = 0;
  for (const [x, y] of s) {
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  return Math.max(maxx - minx, maxy - miny);
}

// a tap becomes a small filled dot (a tight ring sized to the brush), so single
// taps leave a mark — a dot/disc is a valid crop-circle element
function makeDot(center: [number, number], brush: number): NStroke {
  const rad = Math.min(0.07, Math.max(0.016, brush / (2 * FIT_R)));
  const pts: NStroke = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push([center[0] + Math.cos(a) * rad, center[1] + Math.sin(a) * rad]);
  }
  return pts;
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-2" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h2" />
    </svg>
  );
}

export default function DrawPad() {
  const theme = useStore((s) => s.theme);
  const carveDrawing = useStore((s) => s.carveDrawing);
  const open = useStore((s) => s.drawOpen);
  const setOpen = useStore((s) => s.setDrawOpen);

  const [hasStrokes, setHasStrokes] = useState(false);
  const [hasRedo, setHasRedo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [brushIdx, setBrushIdx] = useState(1);
  const brush = BRUSH_SIZES[brushIdx];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef(320); // measured css px size of the (square) canvas
  const strokesRef = useRef<NStroke[]>([]);
  const redoRef = useRef<NStroke[]>([]);
  const currentRef = useRef<NStroke | null>(null);
  const drawingRef = useRef(false);
  const brushRef = useRef(brush);
  brushRef.current = brush;

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const S = sizeRef.current;
    ctx.clearRect(0, 0, S, S);
    // field-bounds guide
    ctx.strokeStyle = "rgba(255, 236, 196, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 236, 196, 0.22)";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    // strokes — preview width scaled so it matches the carved band
    ctx.strokeStyle = "#ffd98a";
    ctx.lineWidth = Math.max(2.5, (brushRef.current * S) / FIT_R);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = currentRef.current ? [...strokesRef.current, currentRef.current] : strokesRef.current;
    for (const s of all) {
      if (s.length < 1) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0] * S, s[0][1] * S);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * S, s[i][1] * S);
      if (s.length === 1) ctx.lineTo(s[0][0] * S + 0.1, s[0][1] * S);
      ctx.stroke();
    }
  };

  // measure the canvas + match the backing buffer to it (crisp + aligned)
  const fit = () => {
    const c = canvasRef.current;
    if (!c) return;
    const css = Math.round(c.clientWidth);
    if (!css) return;
    sizeRef.current = css;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = css * dpr;
    c.height = css * dpr;
    c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };

  useEffect(() => {
    if (!open) return;
    // wait a frame so the modal has laid out before measuring
    const r = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("resize", fit);
    };
  }, [open]);

  // re-draw when the brush changes so existing strokes thicken/thin live
  useEffect(() => {
    if (open) redraw();
  }, [brushIdx, open]);

  const norm = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };

  const onDown = (e: React.PointerEvent) => {
    drawingRef.current = true;
    currentRef.current = [norm(e)];
    canvasRef.current?.setPointerCapture(e.pointerId);
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !currentRef.current) return;
    const p = norm(e);
    const last = currentRef.current[currentRef.current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_DIST) return;
    currentRef.current.push(p);
    redraw();
  };
  const onUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    let s = currentRef.current;
    currentRef.current = null;
    // a tap (or near-tap) drops a dot instead of being discarded
    if (s && s.length && strokeExtent(s) < 0.02) s = makeDot(s[0], brush);
    if (s && s.length > 1) {
      strokesRef.current.push(s);
      redoRef.current = []; // a fresh stroke invalidates the redo stack
      setHasStrokes(true);
      setHasRedo(false);
    }
    redraw();
  };

  const undo = () => {
    const s = strokesRef.current.pop();
    if (s) {
      redoRef.current.push(s);
      setHasRedo(true);
    }
    setHasStrokes(strokesRef.current.length > 0);
    redraw();
  };
  const redo = () => {
    const s = redoRef.current.pop();
    if (s) {
      strokesRef.current.push(s);
      setHasStrokes(true);
    }
    setHasRedo(redoRef.current.length > 0);
    redraw();
  };
  const clear = () => {
    strokesRef.current = [];
    redoRef.current = [];
    currentRef.current = null;
    setHasStrokes(false);
    setHasRedo(false);
    redraw();
  };

  const carve = () => {
    const paths = strokesToPaths(strokesRef.current);
    if (!paths.length) return;
    carveDrawing(paths, brush);
    history.replaceState(null, "", "#d=" + encodeDrawing(strokesRef.current, brush));
    setOpen(false);
  };

  const copyLink = async () => {
    if (!hasStrokes) return;
    const url = shareUrlFor(strokesRef.current, brush);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      history.replaceState(null, "", "#d=" + encodeDrawing(strokesRef.current, brush));
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1900);
  };

  return (
    <div className={"ui-layer" + (theme === "night" ? " night" : "")}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="drawpad-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              className="drawpad"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="drawpad-head">
                <div>
                  <div className="drawpad-title">Carve Your Own</div>
                  <div className="drawpad-sub">Draw a shape or sign — the orbs will trace it into the field.</div>
                </div>
                <button className="drawpad-x" onClick={() => setOpen(false)} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor">
                    <path d="M5 5l8 8M13 5l-8 8" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <canvas
                ref={canvasRef}
                className="drawpad-canvas"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onUp}
              />

              <div className="drawpad-tools">
                <div className="brush-ctl" aria-label="Brush size">
                  <button
                    className="brush-btn"
                    onClick={() => setBrushIdx((i) => Math.max(0, i - 1))}
                    disabled={brushIdx <= 0}
                    aria-label="Decrease brush size"
                    title="Decrease brush size"
                  >
                    −
                  </button>
                  <span
                    className="brush-dot"
                    style={{ width: 5 + brushIdx * 3, height: 5 + brushIdx * 3 }}
                    title="Brush size"
                  />
                  <button
                    className="brush-btn"
                    onClick={() => setBrushIdx((i) => Math.min(BRUSH_SIZES.length - 1, i + 1))}
                    disabled={brushIdx >= BRUSH_SIZES.length - 1}
                    aria-label="Increase brush size"
                    title="Increase brush size"
                  >
                    +
                  </button>
                </div>
                <span className="drawpad-spacer" />
                <button className="drawpad-iconbtn" onClick={undo} disabled={!hasStrokes} aria-label="Undo" title="Undo">
                  <UndoIcon />
                </button>
                <button className="drawpad-iconbtn" onClick={redo} disabled={!hasRedo} aria-label="Redo" title="Redo">
                  <RedoIcon />
                </button>
                <button className="drawpad-tool" onClick={clear} disabled={!hasStrokes && !hasRedo}>
                  Clear
                </button>
              </div>

              <button className="drawpad-tool drawpad-share-btn" onClick={copyLink} disabled={!hasStrokes}>
                {copied ? "Link copied ✓" : "Copy share link"}
              </button>
              <p className="drawpad-share-note">
                {copied
                  ? "Link copied — paste it anywhere to share your formation."
                  : "“Copy share link” turns your drawing into a URL — open it anywhere to see it carved into the field."}
              </p>

              <button className="drawpad-carve" onClick={carve} disabled={!hasStrokes}>
                ✦ Carve the Field
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
