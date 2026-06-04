import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { getPattern } from "../patterns";
import { fpLive } from "../fpLive";

const SIZE = 152;
const VIEW_R = 54; // world radius mapped onto the minimap

// Top-left overview map shown in first person — your position + heading
// relative to the formation.
export default function Minimap() {
  const mode = useStore((s) => s.mode);
  const patternId = useStore((s) => s.patternId);
  const theme = useStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== "fp") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pat = getPattern(patternId);
    const night = theme === "night";
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const scale = (SIZE / 2 - 12) / VIEW_R;
    const toX = (wx: number) => cx + wx * scale;
    const toY = (wz: number) => cy + wz * scale;
    let raf = 0;

    const rot = (vx: number, vz: number, a: number): [number, number] => [
      vx * Math.cos(a) - vz * Math.sin(a),
      vx * Math.sin(a) + vz * Math.cos(a),
    ];

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      ctx.beginPath();
      ctx.arc(cx, cy, SIZE / 2 - 7, 0, Math.PI * 2);
      ctx.fillStyle = night ? "rgba(18,20,42,0.6)" : "rgba(74,58,26,0.42)";
      ctx.fill();

      // formation strokes
      ctx.strokeStyle = night ? "rgba(150,165,228,0.75)" : "rgba(110,86,36,0.85)";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of pat.strokes) {
        ctx.beginPath();
        for (let i = 0; i < s.points.length; i++) {
          const X = toX(s.points[i][0]);
          const Y = toY(s.points[i][1]);
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }

      // you — view cone + dot
      const X = toX(fpLive.x);
      const Y = toY(fpLive.z);
      const fx = Math.sin(fpLive.yaw);
      const fz = Math.cos(fpLive.yaw);
      const [ax, az] = rot(fx, fz, 0.5);
      const [bx, bz] = rot(fx, fz, -0.5);
      const len = 22;
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X + ax * len, Y + az * len);
      ctx.lineTo(X + bx * len, Y + bz * len);
      ctx.closePath();
      ctx.fillStyle = night ? "rgba(206,216,255,0.28)" : "rgba(255,240,194,0.34)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(X, Y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = night ? "#eaf0ff" : "#fff3da";
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [mode, patternId, theme]);

  return (
    <AnimatePresence>
      {mode === "fp" && (
        <motion.div
          className={"minimap" + (theme === "night" ? " night" : "")}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          <div className="minimap-title">Overview</div>
          <canvas ref={canvasRef} width={SIZE} height={SIZE} />
          <div className="minimap-hint">WASD / arrows to walk · scroll out to exit</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
