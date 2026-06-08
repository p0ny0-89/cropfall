import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { strokesToPaths, encodeDrawing, shareUrlFor, FIT_R, type NStroke } from "../share";

const MIN_DIST = 0.012; // min normalized spacing between captured freehand points
const BRUSH_SIZES = [0.8, 1.3, 2.0, 2.8]; // carve half-width (world); preview scaled to match
const TAU = Math.PI * 2;

type Tool = "free" | "line" | "shape";
type ShapeKind = "circle" | "square" | "triangle" | "star";

// bounding-box extent of a stroke (0..1) — tells a tap from a drag / sizes shapes
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

// a tap becomes a small filled dot sized to the brush
function makeDot(center: [number, number], brush: number): NStroke {
  const rad = Math.min(0.07, Math.max(0.016, brush / (2 * FIT_R)));
  const pts: NStroke = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * TAU;
    pts.push([center[0] + Math.cos(a) * rad, center[1] + Math.sin(a) * rad]);
  }
  return pts;
}

function rotPt(p: [number, number], cx: number, cy: number, a: number): [number, number] {
  const dx = p[0] - cx, dy = p[1] - cy, c = Math.cos(a), s = Math.sin(a);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

// a preset shape centred at (cx,cy) with "radius" r
function shapePoints(cx: number, cy: number, r: number, kind: ShapeKind): NStroke {
  const pts: NStroke = [];
  if (kind === "circle") {
    for (let i = 0; i <= 30; i++) { const a = (i / 30) * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  } else if (kind === "triangle") {
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  } else if (kind === "square") {
    const s = r * 0.8;
    for (const [dx, dy] of [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]]) pts.push([cx + dx, cy + dy]);
  } else {
    const inner = r * 0.45;
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU; const rr = i % 2 === 0 ? r : inner; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  }
  return pts;
}

// radial copies of a stroke around the canvas centre (0.5,0.5)
function symCopies(base: NStroke, n: number): NStroke[] {
  if (n <= 1) return [base];
  const out: NStroke[] = [];
  for (let k = 0; k < n; k++) out.push(base.map((p) => rotPt(p, 0.5, 0.5, (k / n) * TAU)));
  return out;
}

const SHAPE_GLYPH: Record<ShapeKind, string> = { circle: "○", square: "□", triangle: "△", star: "★" };

function PencilIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4.5l5 5M3 21l1.2-4.2L16 5a2.1 2.1 0 0 1 3 3L7.2 19.8 3 21z" /></svg>;
}
function LineToolIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.7" fill="currentColor" stroke="none" /><circle cx="19" cy="5" r="1.7" fill="currentColor" stroke="none" /></svg>;
}
function ShapeToolIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 3l8 6-3 9.4H7L4 9l8-6z" /></svg>;
}
function SymIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="2.2" /><path d="M12 3.2v3.4M12 17.4v3.4M3.2 12h3.4M17.4 12h3.4M6 6l2.4 2.4M15.6 15.6L18 18M18 6l-2.4 2.4M8.4 15.6L6 18" /></svg>;
}
function UndoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-2" /></svg>;
}
function RedoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h2" /></svg>;
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
  const [tool, setTool] = useState<Tool>("free");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("circle");
  const [sym, setSym] = useState(false);
  const [symCount, setSymCount] = useState(6);
  const brush = BRUSH_SIZES[brushIdx];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef(320);
  // an "action" is one or more strokes committed together (so radial symmetry +
  // undo group correctly). The whole drawing is a flat list of all their strokes.
  const actionsRef = useRef<NStroke[][]>([]);
  const redoRef = useRef<NStroke[][]>([]);
  const currentRef = useRef<NStroke | null>(null); // in-progress base stroke
  const startRef = useRef<[number, number]>([0, 0]); // line start / shape centre
  const drawingRef = useRef(false);

  // mirror state into refs so the live pointer handlers always read the latest
  const brushRef = useRef(brush); brushRef.current = brush;
  const toolRef = useRef(tool); toolRef.current = tool;
  const shapeRef = useRef(shapeKind); shapeRef.current = shapeKind;
  const symRef = useRef(sym); symRef.current = sym;
  const symCountRef = useRef(symCount); symCountRef.current = symCount;

  const displayOf = (base: NStroke) => (symRef.current ? symCopies(base, symCountRef.current) : [base]);

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
    ctx.arc(S / 2, S / 2, S * 0.47, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 236, 196, 0.22)";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 2, 0, TAU);
    ctx.fill();

    const all: NStroke[] = [];
    for (const action of actionsRef.current) for (const s of action) all.push(s);
    if (currentRef.current) for (const s of displayOf(currentRef.current)) all.push(s);

    ctx.strokeStyle = "#ffd98a";
    ctx.lineWidth = Math.max(2.5, (brushRef.current * S) / FIT_R);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of all) {
      if (s.length < 1) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0] * S, s[0][1] * S);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * S, s[i][1] * S);
      if (s.length === 1) ctx.lineTo(s[0][0] * S + 0.1, s[0][1] * S);
      ctx.stroke();
    }
  };

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
    const r = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("resize", fit);
    };
  }, [open]);

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
    const p = norm(e);
    startRef.current = p;
    const t = toolRef.current;
    if (t === "free") currentRef.current = [p];
    else if (t === "line") currentRef.current = [p, p];
    else currentRef.current = shapePoints(p[0], p[1], 0.001, shapeRef.current);
    canvasRef.current?.setPointerCapture(e.pointerId);
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !currentRef.current) return;
    const p = norm(e);
    const t = toolRef.current;
    if (t === "free") {
      const last = currentRef.current[currentRef.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_DIST) return;
      currentRef.current.push(p);
    } else if (t === "line") {
      currentRef.current = [startRef.current, p];
    } else {
      const r = Math.hypot(p[0] - startRef.current[0], p[1] - startRef.current[1]);
      currentRef.current = shapePoints(startRef.current[0], startRef.current[1], Math.max(0.012, r), shapeRef.current);
    }
    redraw();
  };
  const onUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    let base = currentRef.current;
    currentRef.current = null;
    const t = toolRef.current;
    if (base) {
      if (t === "free" && base.length && strokeExtent(base) < 0.02) base = makeDot(base[0], brushRef.current);
      const tooSmall = t !== "free" && strokeExtent(base) < 0.035; // ignore accidental tiny shapes/lines
      if (!tooSmall && base.length > 1) {
        actionsRef.current.push(displayOf(base));
        redoRef.current = [];
        setHasStrokes(true);
        setHasRedo(false);
      }
    }
    redraw();
  };

  const undo = () => {
    const a = actionsRef.current.pop();
    if (a) { redoRef.current.push(a); setHasRedo(true); }
    setHasStrokes(actionsRef.current.length > 0);
    redraw();
  };
  const redo = () => {
    const a = redoRef.current.pop();
    if (a) { actionsRef.current.push(a); setHasStrokes(true); }
    setHasRedo(redoRef.current.length > 0);
    redraw();
  };
  const clear = () => {
    actionsRef.current = [];
    redoRef.current = [];
    currentRef.current = null;
    setHasStrokes(false);
    setHasRedo(false);
    redraw();
  };

  const flat = () => actionsRef.current.flat();

  const carve = () => {
    const strokes = flat();
    const paths = strokesToPaths(strokes);
    if (!paths.length) return;
    carveDrawing(paths, brush);
    history.replaceState(null, "", "#d=" + encodeDrawing(strokes, brush));
    setOpen(false);
  };

  const copyLink = async () => {
    if (!hasStrokes) return;
    const strokes = flat();
    const url = shareUrlFor(strokes, brush);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      history.replaceState(null, "", "#d=" + encodeDrawing(strokes, brush));
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

              <div className="drawpad-toolbar">
                <button className={"tool-btn" + (tool === "free" ? " active" : "")} onClick={() => setTool("free")} title="Freehand" aria-label="Freehand"><PencilIcon /></button>
                <button className={"tool-btn" + (tool === "line" ? " active" : "")} onClick={() => setTool("line")} title="Line" aria-label="Line"><LineToolIcon /></button>
                <button className={"tool-btn" + (tool === "shape" ? " active" : "")} onClick={() => setTool("shape")} title="Shape" aria-label="Shape"><ShapeToolIcon /></button>

                {tool === "shape" && (
                  <div className="shape-picker">
                    {(["circle", "square", "triangle", "star"] as ShapeKind[]).map((k) => (
                      <button key={k} className={"shape-btn" + (shapeKind === k ? " active" : "")} onClick={() => setShapeKind(k)} title={k} aria-label={k}>
                        {SHAPE_GLYPH[k]}
                      </button>
                    ))}
                  </div>
                )}

                <span className="drawpad-spacer" />

                <button className={"tool-btn sym-toggle" + (sym ? " active" : "")} onClick={() => setSym((s) => !s)} title="Radial symmetry" aria-label="Radial symmetry">
                  <SymIcon />
                  {!sym && <span className="sym-label">Radial Symmetry</span>}
                </button>
                {sym && (
                  <div className="sym-count" title="Mirror count">
                    <button className="brush-btn" onClick={() => setSymCount((n) => Math.max(2, n - 1))} disabled={symCount <= 2} aria-label="Fewer mirrors">−</button>
                    <span className="sym-num">{symCount}</span>
                    <button className="brush-btn" onClick={() => setSymCount((n) => Math.min(16, n + 1))} disabled={symCount >= 16} aria-label="More mirrors">+</button>
                  </div>
                )}
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
                  <button className="brush-btn" onClick={() => setBrushIdx((i) => Math.max(0, i - 1))} disabled={brushIdx <= 0} aria-label="Decrease brush size" title="Decrease brush size">−</button>
                  <span className="brush-dot" style={{ width: 5 + brushIdx * 3, height: 5 + brushIdx * 3 }} title="Brush size" />
                  <button className="brush-btn" onClick={() => setBrushIdx((i) => Math.min(BRUSH_SIZES.length - 1, i + 1))} disabled={brushIdx >= BRUSH_SIZES.length - 1} aria-label="Increase brush size" title="Increase brush size">+</button>
                </div>
                <span className="drawpad-spacer" />
                <button className="drawpad-iconbtn" onClick={undo} disabled={!hasStrokes} aria-label="Undo" title="Undo"><UndoIcon /></button>
                <button className="drawpad-iconbtn" onClick={redo} disabled={!hasRedo} aria-label="Redo" title="Redo"><RedoIcon /></button>
                <button className="drawpad-tool" onClick={clear} disabled={!hasStrokes && !hasRedo}>Clear</button>
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
