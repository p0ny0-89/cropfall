import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { useStore } from "./store";
import { pathHit } from "./patterns";
import { rustle } from "./audio";

// A couple of little grey aliens that peep up between the standing crops and
// duck back down — and occasionally scurry across the field. Only shown in
// aerial mode, so they stay distant, ambiguous glimpses. The low-poly model is
// lit by the scene and tinted per theme (periwinkle night / cream day) so it
// blends with the field; the baked-dark eyes stay dark through the tint.

const COUNT = 3;
const MODEL = `${import.meta.env.BASE_URL}alien.obj`;
const TEX = `${import.meta.env.BASE_URL}alien-diffuse.jpg`;
const SCALE = 0.58; // model is ~4.3u tall → ~2.5u
const FACE_OFFSET = Math.PI; // rotate so the face (eyes) turns toward the camera
const PEEK_Y = 0.0; // feet on the ground → head + shoulders clear the crop line
const REST_Y = -1.7; // sunk down among the stalks (also faded out)

const NIGHT_TINT = new THREE.Color("#8588d0");
const DAY_TINT = new THREE.Color("#e4dbc1");

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

const damp = THREE.MathUtils.damp;

function AliensImpl() {
  const { camera } = useThree();
  const theme = useStore((s) => s.theme);

  const obj = useLoader(OBJLoader, MODEL);
  const tex = useLoader(THREE.TextureLoader, TEX);

  const geo = useMemo(() => {
    let g: THREE.BufferGeometry | null = null;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !g) g = m.geometry as THREE.BufferGeometry;
    });
    const out = g ?? new THREE.BufferGeometry();
    if (!out.attributes.normal) out.computeVertexNormals();
    return out;
  }, [obj]);

  const mats = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const init = useStore.getState().theme === "night" ? NIGHT_TINT : DAY_TINT;
    return Array.from(
      { length: COUNT },
      () =>
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.82,
          metalness: 0,
          transparent: true,
          opacity: 0,
          color: init.clone(),
        })
    );
  }, [tex]);

  const groups = useRef<THREE.Group[]>([]);
  const tint = useMemo(() => (theme === "night" ? NIGHT_TINT : DAY_TINT), [theme]);
  const aliens = useRef<Alien[]>(
    Array.from({ length: COUNT }, () => ({
      phase: "hidden" as Phase,
      timer: 2 + Math.random() * 6,
      t: 0,
      life: 0,
      op: 0,
      pos: new THREE.Vector3(0, REST_Y, 0),
      vel: new THREE.Vector3(),
    }))
  );

  const startPeep = (a: Alien) => {
    // find a spot in the *standing* crops — never on a flattened/downed path
    const pat = useStore.getState().activePattern;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 16; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 34;
      x = Math.cos(ang) * r;
      z = Math.sin(ang) * r;
      if (pathHit(x, z, pat).dist > pat.radius * 1.7) break; // clear of the lay
    }
    a.pos.set(x, REST_Y, z);
    a.life = 1.8 + Math.random() * 2.6;
    a.t = 0;
    a.phase = "peep";
  };

  const startScurry = (a: Alien) => {
    const ang = Math.random() * Math.PI * 2;
    const r = 34 + Math.random() * 10;
    a.pos.set(Math.cos(ang) * r, PEEK_Y, Math.sin(ang) * r);
    const dir = ang + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = 14 + Math.random() * 9;
    a.vel.set(Math.cos(dir), 0, Math.sin(dir)).multiplyScalar(speed);
    a.life = 1.5 + Math.random() * 1.1;
    a.t = 0;
    a.phase = "scurry";
    // faint distant rustle through the stalks, panned to its side
    if (useStore.getState().sound) rustle(Math.max(-0.8, Math.min(0.8, a.pos.x / 40)), a.life);
  };

  useFrame((_, dt) => {
    const s = useStore.getState();
    const aerialActive = s.mode === "aerial" && s.phase === "explore";
    const k = 1 - Math.pow(0.0001, dt);

    for (let i = 0; i < COUNT; i++) {
      const a = aliens.current[i];
      const g = groups.current[i];
      const mat = mats[i];
      if (!g) continue;
      mat.color.lerp(tint, k);

      if (!aerialActive) {
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
          const rise = Math.min(1, a.t / 0.5);
          const fall = a.t > a.life - 0.55 ? Math.max(0, (a.life - a.t) / 0.55) : 1;
          const env = Math.min(rise, fall);
          a.pos.y = THREE.MathUtils.lerp(REST_Y, PEEK_Y, env) + Math.sin(a.t * 3.5) * 0.05 * env;
          a.op = env;
          if (a.t >= a.life) {
            a.phase = "hidden";
            a.timer = 7 + Math.random() * 9;
          }
          break;
        }
        case "scurry": {
          a.t += dt;
          a.pos.addScaledVector(a.vel, dt);
          a.pos.y = PEEK_Y + Math.sin(a.t * 12) * 0.08;
          a.op = Math.sin(Math.min(1, a.t / a.life) * Math.PI);
          if (a.t >= a.life) {
            a.phase = "hidden";
            a.timer = 7 + Math.random() * 9;
          }
          break;
        }
      }

      g.position.copy(a.pos);
      mat.opacity = a.op;
      g.visible = a.op > 0.01;

      // orientation:
      //  - scurrying → face the direction it's running
      //  - peeping in the foreground (between viewer & centre) → face the
      //    crop-circle centre (no direct stare when it's close/large)
      //  - peeping from beyond the circle (a distant glimpse) → face the viewer
      let tx: number;
      let tz: number;
      if (a.phase === "scurry") {
        tx = a.pos.x + a.vel.x;
        tz = a.pos.z + a.vel.z;
      } else {
        const camDist = Math.hypot(camera.position.x, camera.position.z);
        const toCam = Math.hypot(camera.position.x - a.pos.x, camera.position.z - a.pos.z);
        if (toCam < camDist * 0.95) {
          tx = 0; // foreground → look toward the formation centre
          tz = 0;
        } else {
          tx = camera.position.x; // distant peep → look toward the viewer
          tz = camera.position.z;
        }
      }
      g.rotation.y = Math.atan2(tx - a.pos.x, tz - a.pos.z) + FACE_OFFSET;
    }
  });

  return (
    <>
      {Array.from({ length: COUNT }).map((_, i) => (
        <group key={i} ref={(g) => g && (groups.current[i] = g)} visible={false}>
          <mesh geometry={geo} material={mats[i]} scale={SCALE} castShadow={false} />
        </group>
      ))}
    </>
  );
}

export default function Aliens() {
  return (
    <Suspense fallback={null}>
      <AliensImpl />
    </Suspense>
  );
}
