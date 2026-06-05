import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PATTERNS } from "../patterns";
import { useStore } from "../store";
import FormationLab from "./FormationLab";

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

export default function ControlPanel() {
  const patternId = useStore((s) => s.patternId);
  const phase = useStore((s) => s.phase);
  const mode = useStore((s) => s.mode);
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
