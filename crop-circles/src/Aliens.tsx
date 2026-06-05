import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "./store";

// A couple of abstract grey-alien silhouettes that peep up between the standing
// crops and duck back down — and occasionally scurry across the field. Only
// shown in aerial mode, so it always stays a distant, ambiguous glimpse.

const COUNT = 2;
const PEEK_Y = 1.45; // head pokes just above the crop line
const REST_Y = -0.35; // tucked down among the stalks (also faded out)

type Phase = "hidden" | "peep" | "scurry";
interface Alien {
  phase: Phase;
  timer: number;
  t: number;
  life: number;
  op: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

// A dark alien silhouette — recognisable by the big-cranium head + thin body,
// not by detail. The lower body fades out so it dissolves into the crops.
function makeAlienTexture() {
  const W = 140;
  const H = 270;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  // Drawn white/grey so the per-theme tint is applied via material.color; the
  // eyes are dark so they stay dark whatever the body is tinted to.
  x.lineCap = "round";
  x.lineJoin = "round";

  // arms + legs (thin limbs)
  x.strokeStyle = "#d8d8da";
  x.lineWidth = 8;
  x.beginPath(); // left arm
  x.moveTo(56, 158);
  x.bezierCurveTo(40, 178, 40, 206, 49, 230);
  x.stroke();
  x.beginPath(); // right arm
  x.moveTo(84, 158);
  x.bezierCurveTo(100, 178, 100, 206, 91, 230);
  x.stroke();
  x.lineWidth = 9;
  x.beginPath(); // legs
  x.moveTo(64, 214);
  x.lineTo(60, 268);
  x.moveTo(76, 214);
  x.lineTo(80, 268);
  x.stroke();

  // torso
  x.fillStyle = "#dedee0";
  x.beginPath();
  x.moveTo(56, 150);
  x.bezierCurveTo(45, 166, 46, 206, 60, 222);
  x.bezierCurveTo(66, 229, 74, 229, 80, 222);
  x.bezierCurveTo(94, 206, 95, 166, 84, 150);
  x.closePath();
  x.fill();
  x.fillRect(62, 116, 16, 38); // neck

  // head (big cranium) with soft shading
  const hg = x.createRadialGradient(58, 46, 6, 70, 66, 72);
  hg.addColorStop(0, "#ffffff");
  hg.addColorStop(1, "#cdced2");
  x.fillStyle = hg;
  x.beginPath();
  x.moveTo(70, 6);
  x.bezierCurveTo(126, 6, 130, 70, 93, 116);
  x.bezierCurveTo(83, 132, 57, 132, 47, 116);
  x.bezierCurveTo(10, 70, 14, 6, 70, 6);
  x.closePath();
  x.fill();

  // big slanted almond eyes
  x.fillStyle = "#0c0c14";
  x.save();
  x.translate(52, 82);
  x.rotate(0.52);
  x.beginPath();
  x.ellipse(0, 0, 19, 10, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  x.save();
  x.translate(88, 82);
  x.rotate(-0.52);
  x.beginPath();
  x.ellipse(0, 0, 19, 10, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  // faint glints
  x.fillStyle = "rgba(255,255,255,0.4)";
  x.beginPath();
  x.ellipse(45, 78, 3, 2, 0.5, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(95, 78, 3, 2, -0.5, 0, Math.PI * 2);
  x.fill();

  // vertical fade so the legs melt into the crops (no hard cut-off)
  x.globalCompositeOperation = "destination-in";
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.72, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const damp = THREE.MathUtils.damp;

export default function Aliens() {
  const { camera } = useThree();
  const theme = useStore((s) => s.theme);
  const tex = useMemo(makeAlienTexture, []);
  // tint the body to the time of day so the alien blends with the field —
  // periwinkle at night, pale cream by day (the dark eyes stay the tell)
  const targetCol = useMemo(
    () => new THREE.Color(theme === "night" ? "#8c88dd" : "#e7dcc0"),
    [theme]
  );
  const groups = useRef<THREE.Group[]>([]);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  const aliens = useRef<Alien[]>(
    Array.from({ length: COUNT }, () => ({
      phase: "hidden" as Phase,
      timer: 3 + Math.random() * 8,
      t: 0,
      life: 0,
      op: 0,
      pos: new THREE.Vector3(0, REST_Y, 0),
      vel: new THREE.Vector3(),
    }))
  );

  const startPeep = (a: Alien) => {
    const ang = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 32; // among the standing crops
    a.pos.set(Math.cos(ang) * r, REST_Y, Math.sin(ang) * r);
    a.life = 1.6 + Math.random() * 2.4;
    a.t = 0;
    a.phase = "peep";
  };

  const startScurry = (a: Alien) => {
    const ang = Math.random() * Math.PI * 2;
    const r = 34 + Math.random() * 10;
    a.pos.set(Math.cos(ang) * r, PEEK_Y, Math.sin(ang) * r);
    // dash roughly tangent to the field, with a little inward bias
    const dir = ang + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = 16 + Math.random() * 10;
    a.vel.set(Math.cos(dir), 0, Math.sin(dir)).multiplyScalar(speed);
    a.life = 1.4 + Math.random() * 1.0;
    a.t = 0;
    a.phase = "scurry";
  };

  useFrame((_, dt) => {
    const s = useStore.getState();
    const active = s.mode === "aerial" && s.phase === "explore";
    const ck = 1 - Math.pow(0.0008, dt);

    for (let i = 0; i < COUNT; i++) {
      const a = aliens.current[i];
      const g = groups.current[i];
      const mat = mats.current[i];
      if (!g || !mat) continue;
      mat.color.lerp(targetCol, ck);

      if (!active) {
        a.op = damp(a.op, 0, 6, dt);
        if (a.op < 0.02 && a.phase !== "hidden") {
          a.phase = "hidden";
          a.timer = 4 + Math.random() * 8;
        }
        mat.opacity = a.op;
        g.visible = a.op > 0.01;
        continue;
      }

      switch (a.phase) {
        case "hidden":
          a.timer -= dt;
          a.op = damp(a.op, 0, 6, dt);
          if (a.timer <= 0) (Math.random() < 0.4 ? startScurry : startPeep)(a);
          break;
        case "peep": {
          a.t += dt;
          const rise = Math.min(1, a.t / 0.45);
          const fall = a.t > a.life - 0.5 ? Math.max(0, (a.life - a.t) / 0.5) : 1;
          const env = Math.min(rise, fall);
          a.pos.y = THREE.MathUtils.lerp(REST_Y, PEEK_Y, env) + Math.sin(a.t * 4) * 0.04 * env;
          a.op = env * 0.9;
          if (a.t >= a.life) {
            a.phase = "hidden";
            a.timer = 8 + Math.random() * 13;
          }
          break;
        }
        case "scurry": {
          a.t += dt;
          a.pos.addScaledVector(a.vel, dt);
          a.pos.y = PEEK_Y + Math.sin(a.t * 11) * 0.07;
          a.op = Math.sin(Math.min(1, a.t / a.life) * Math.PI) * 0.85;
          if (a.t >= a.life) {
            a.phase = "hidden";
            a.timer = 9 + Math.random() * 13;
          }
          break;
        }
      }

      g.position.copy(a.pos);
      mat.opacity = a.op;
      g.visible = a.op > 0.01;
      // upright billboard — face the camera horizontally
      g.rotation.y = Math.atan2(camera.position.x - a.pos.x, camera.position.z - a.pos.z);
    }
  });

  return (
    <>
      {Array.from({ length: COUNT }).map((_, i) => (
        <group key={i} ref={(g) => g && (groups.current[i] = g)} visible={false}>
          <mesh>
            <planeGeometry args={[1.15, 2.2]} />
            <meshBasicMaterial
              ref={(m) => m && (mats.current[i] = m as THREE.MeshBasicMaterial)}
              map={tex}
              color="#e7dcc0"
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
