import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PATTERNS } from "../patterns";
import { useStore } from "../store";
import { paletteFor } from "../theme";
import FormationLab from "./FormationLab";

// quick presets; gold (the natural default crop) first, then stylized hues.
// the native picker on the end covers anything else.
const CROP_PRESETS = ["#d2a13f", "#5aa83c", "#2fa39a", "#7d6cd6", "#cc5a86"];

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3.2" strokeWidth="1.6" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor">
      <path d="M5 5l8 8M13 5l-8 8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="draw-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M14.5 4.5l5 5M3 21l1.2-4.2L16 5a2.1 2.1 0 0 1 3 3L7.2 19.8 3 21z" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export default function ControlPanel() {
  const patternId = useStore((s) => s.patternId);
  const phase = useStore((s) => s.phase);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const selectPattern = useStore((s) => s.selectPattern);
  const reform = useStore((s) => s.reform);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const cropColor = useStore((s) => s.cropColor);
  const setCropColor = useStore((s) => s.setCropColor);
  const setDrawOpen = useStore((s) => s.setDrawOpen);
  const [open, setOpen] = useState(true);
  const [copiedDraw, setCopiedDraw] = useState(false);

  // copy the current drawing's share link straight from the panel (the carve
  // step already stored it in the URL hash) — no need to reopen the canvas
  const shareDraw = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopiedDraw(true);
    window.setTimeout(() => setCopiedDraw(false), 1600);
  };

  const forming = phase === "forming";
  // what the native picker shows when no custom colour is set yet
  const pickerValue = cropColor ?? paletteFor(theme).bladeB;

  return (
    <div className={"ui-layer" + (theme === "night" ? " night" : "")}>
      <button
        className={"panel-fab" + (open ? " open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Hide settings" : "Show settings"}
      >
        {open ? (
          <CloseIcon />
        ) : (
          <>
            <GearIcon />
            <span className="fab-label">Settings</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="panel"
            key="panel"
            initial={{ opacity: 0, x: 18, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 18, scale: 0.96 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-label">Select Formation</div>
            <div className="pattern-list">
              {PATTERNS.map((p) => (
                <button
                  key={p.id}
                  className={"pattern-btn" + (p.id === patternId ? " active" : "")}
                  onClick={() => selectPattern(p.id)}
                >
                  <span className="dot" />
                  {p.label}
                </button>
              ))}
              <button
                className={"pattern-btn lab-entry" + (patternId === "custom" ? " active" : "")}
                onClick={() => selectPattern("custom")}
              >
                <span className="dot" />
                Formation Lab
              </button>
              <button
                className={"pattern-btn draw-entry" + (patternId === "drawn" ? " active" : "")}
                onClick={() => setDrawOpen(true)}
              >
                <PencilIcon />
                Draw
                {patternId === "drawn" && (
                  <span
                    className={"share-btn" + (copiedDraw ? " copied" : "")}
                    role="button"
                    tabIndex={0}
                    aria-label="Copy share link"
                    title={copiedDraw ? "Link copied" : "Copy share link"}
                    onClick={shareDraw}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") shareDraw(e);
                    }}
                  >
                    {copiedDraw ? <CheckIcon /> : <LinkIcon />}
                  </span>
                )}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {patternId === "custom" && (
                <motion.div
                  key="lab"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ overflow: "hidden" }}
                >
                  <FormationLab />
                </motion.div>
              )}
            </AnimatePresence>

            <button className="reform-btn" onClick={reform}>
              ↻ Reform Field
            </button>

            <button
              className={"theme-toggle" + (theme === "night" ? " night" : "")}
              onClick={toggleTheme}
            >
              <span className="theme-track">
                <span className="theme-knob">{theme === "night" ? "☾" : "☀"}</span>
              </span>
              {theme === "night" ? "Moonlit" : "Daylight"}
            </button>

            <div className="crop-color">
              <div className="crop-color-head">
                <span>Crop Color</span>
                {cropColor && (
                  <button className="crop-reset" onClick={() => setCropColor(null)}>
                    Reset
                  </button>
                )}
              </div>
              <div className="swatch-row">
                {CROP_PRESETS.map((c) => (
                  <button
                    key={c}
                    className={"swatch" + (cropColor === c ? " active" : "")}
                    style={{ background: c }}
                    onClick={() => setCropColor(c)}
                    aria-label={"Crop colour " + c}
                  />
                ))}
                <label
                  className={"swatch swatch-custom" + (cropColor && !CROP_PRESETS.includes(cropColor) ? " active" : "")}
                  aria-label="Pick a custom crop colour"
                >
                  <input
                    type="color"
                    value={pickerValue}
                    onChange={(e) => setCropColor(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {forming && (
          <motion.div
            className="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="status-pulse" />
            forming…
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "explore" ? 1 : 0 }}
        transition={{ duration: 1 }}
      >
        {mode === "fp"
          ? "W A S D to move · arrows to turn · move mouse to look · scroll out to exit"
          : "move cursor to explore · click a glowing path to step inside"}
      </motion.div>

      <div className="vignette" />
    </div>
  );
}
