import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PATTERNS } from "../patterns";
import { useStore } from "../store";

// concentric-rings glyph — the "open formations" affordance
function RingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <circle cx="10" cy="10" r="8" strokeWidth="1.1" opacity="0.55" />
      <circle cx="10" cy="10" r="5" strokeWidth="1.1" opacity="0.8" />
      <circle cx="10" cy="10" r="1.7" fill="currentColor" stroke="none" />
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

export default function ControlPanel() {
  const patternId = useStore((s) => s.patternId);
  const phase = useStore((s) => s.phase);
  const theme = useStore((s) => s.theme);
  const selectPattern = useStore((s) => s.selectPattern);
  const reform = useStore((s) => s.reform);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const [open, setOpen] = useState(true);

  const forming = phase === "forming";

  return (
    <div className={"ui-layer" + (theme === "night" ? " night" : "")}>
      <button
        className={"panel-fab" + (open ? " open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Hide formations" : "Show formations"}
      >
        {open ? <CloseIcon /> : <RingsIcon />}
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
            </div>
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
        move cursor to explore · up for aerial · down for ground level
      </motion.div>

      <div className="vignette" />
    </div>
  );
}
