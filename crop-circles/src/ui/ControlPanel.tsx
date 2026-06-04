import { motion, AnimatePresence } from "framer-motion";
import { PATTERNS } from "../patterns";
import { useStore } from "../store";

export default function ControlPanel() {
  const patternId = useStore((s) => s.patternId);
  const phase = useStore((s) => s.phase);
  const selectPattern = useStore((s) => s.selectPattern);
  const reform = useStore((s) => s.reform);

  const forming = phase === "forming";

  return (
    <div className="ui-layer">
      <motion.header
        className="title"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        <span className="title-main">CROPFALL</span>
        <span className="title-sub">aerial formations · observation field</span>
      </motion.header>

      <motion.div
        className="panel"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.6 }}
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
      </motion.div>

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
