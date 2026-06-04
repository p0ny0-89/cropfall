import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import CropField from "./CropField";
import Ground from "./Ground";
import Orbs from "./Orbs";
import Sky from "./Sky";
import { useStore } from "./store";
import { paletteFor } from "./theme";
import { pathHit } from "./patterns";
import { fpLive } from "./fpLive";

const FORM_DURATION = 6.5; // seconds for a full formation
const EYE = 1.7; // first-person eye height

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const damp = THREE.MathUtils.damp;
function dampVec(v: THREE.Vector3, t: THREE.Vector3, rate: number, dt: number) {
  v.x = damp(v.x, t.x, rate, dt);
  v.y = damp(v.y, t.y, rate, dt);
  v.z = damp(v.z, t.z, rate, dt);
}

// Drives formProgress 0->1 and flips phase intro->forming->explore.
function FormationDriver() {
  const lastToken = useRef(-1);
  const startT = useRef(0);
  useFrame((state) => {
    const s = useStore.getState();
    if (s.formToken !== lastToken.current) {
      lastToken.current = s.formToken;
      startT.current = state.clock.elapsedTime;
      s.setPhase("forming");
      s.setProgress(0);
    }
    if (s.phase === "forming") {
      const e = (state.clock.elapsedTime - startT.current) / FORM_DURATION;
      if (e >= 1) {
        s.setProgress(1);
        s.setPhase("explore");
      } else {
        s.setProgress(easeInOut(Math.max(0, e)));
      }
    }
  });
  return null;
}

// Camera: auto-orbiting aerial during formation, pointer parallax while
// exploring, and a walkable first-person "street view" when you drop into a
// path. Scrolling out of first-person returns to the aerial view.
function CameraSystem() {
  const { camera, pointer } = useThree();
  const el = useRef(THREE.MathUtils.degToRad(57));
  const az = useRef(0);
  const rad = useRef(39);
  const fpPos = useRef(new THREE.Vector3(0, EYE, 0));
  const fpYaw = useRef(0);
  const fpPitch = useRef(0);
  const look = useRef(new THREE.Vector3(0, 1.2, 0));
  const keys = useRef<Set<string>>(new Set());
  const center = useMemo(() => new THREE.Vector3(0, 1.2, 0), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const azSpin = useRef(0); // continuous orbit accumulator — never jumps
  const pSmooth = useRef({ x: 0, y: 0 }); // smoothed pointer (kills jitter)
  const blend = useRef(0); // 0..1 ease used for the intro + FP-exit glide
  const blendFrom = useRef(new THREE.Vector3());
  const prevMode = useRef<string | null>(null);
  const mode = useStore((s) => s.mode);

  // seed the walker where the drop-in happened
  useEffect(() => {
    if (mode === "fp") {
      const s = useStore.getState().fpStart;
      fpPos.current.set(s.x, EYE, s.z);
      fpYaw.current = s.yaw;
      fpPitch.current = 0;
    }
  }, [mode]);

  // keyboard nav + scroll-to-exit
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (useStore.getState().mode === "fp") {
        const nav = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
        if (nav.includes(e.code)) e.preventDefault();
        if (e.code === "Escape") useStore.getState().exitFirstPerson();
      }
      keys.current.add(e.code);
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code);
    const wheel = (e: WheelEvent) => {
      if (useStore.getState().mode === "fp" && e.deltaY > 0)
        useStore.getState().exitFirstPerson();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("wheel", wheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("wheel", wheel);
    };
  }, []);

  useFrame((state, dt) => {
    const s = useStore.getState();

    if (s.mode === "fp") {
      const k = keys.current;
      const turn = 1.8 * dt;
      const speed = 8.5 * dt;

      // mouse-look: cursor offset from centre turns the view (dead-zone in the
      // middle). No pointer-lock needed, so it works inside any iframe.
      const dz = 0.22;
      const lookRate = 2.2;
      const edge = (v: number) =>
        Math.abs(v) > dz ? (v - Math.sign(v) * dz) / (1 - dz) : 0;
      fpYaw.current -= edge(pointer.x) * lookRate * dt;
      fpPitch.current = THREE.MathUtils.clamp(
        fpPitch.current + edge(pointer.y) * lookRate * dt,
        -1.1,
        1.1
      );

      if (k.has("ArrowLeft")) fpYaw.current += turn;
      if (k.has("ArrowRight")) fpYaw.current -= turn;
      const fx = Math.sin(fpYaw.current);
      const fz = Math.cos(fpYaw.current);
      const rx = -Math.cos(fpYaw.current); // screen-right strafe vector
      const rz = Math.sin(fpYaw.current);
      if (k.has("ArrowUp") || k.has("KeyW")) {
        fpPos.current.x += fx * speed;
        fpPos.current.z += fz * speed;
      }
      if (k.has("ArrowDown") || k.has("KeyS")) {
        fpPos.current.x -= fx * speed;
        fpPos.current.z -= fz * speed;
      }
      if (k.has("KeyD")) {
        fpPos.current.x += rx * speed;
        fpPos.current.z += rz * speed;
      }
      if (k.has("KeyA")) {
        fpPos.current.x -= rx * speed;
        fpPos.current.z -= rz * speed;
      }
      const d = Math.hypot(fpPos.current.x, fpPos.current.z);
      const maxR = 52;
      if (d > maxR) {
        fpPos.current.x *= maxR / d;
        fpPos.current.z *= maxR / d;
      }
      fpPos.current.y = EYE;

      fpLive.x = fpPos.current.x;
      fpLive.z = fpPos.current.z;
      fpLive.yaw = fpYaw.current;

      // look direction from yaw + mouse pitch
      const cp = Math.cos(fpPitch.current);
      lookTarget.set(
        fpPos.current.x + fx * cp * 6,
        EYE + Math.sin(fpPitch.current) * 6,
        fpPos.current.z + fz * cp * 6
      );
      dampVec(camera.position, fpPos.current, 6, dt); // smooth drop-in, then tracks
      dampVec(look.current, lookTarget, 16, dt); // crisp, responsive mouse-look
      camera.lookAt(look.current);
      prevMode.current = "fp";
      return;
    }

    // ---- aerial -----------------------------------------------------------
    // Start an eased glide on first run and whenever we just left first person,
    // so the camera settles into the orbit instead of snapping.
    if (prevMode.current !== "aerial") {
      blendFrom.current.copy(camera.position);
      blend.current = 0;
    }
    prevMode.current = "aerial";

    // smooth the pointer so tiny jitter never shakes the camera
    pSmooth.current.x = damp(pSmooth.current.x, pointer.x, 5, dt);
    pSmooth.current.y = damp(pSmooth.current.y, pointer.y, 5, dt);

    // one continuous, slow orbit — accumulating means the target never lurches
    // backward across the forming -> explore handoff
    azSpin.current += (s.phase === "explore" ? 0.016 : 0.05) * dt;

    let tEl: number, tAz: number, tRad: number;
    if (s.phase === "explore") {
      const py = (pSmooth.current.y + 1) / 2;
      tEl = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(16, 60, py));
      tAz = azSpin.current + THREE.MathUtils.degToRad(22) * pSmooth.current.x;
      tRad = THREE.MathUtils.lerp(21, 36, py);
    } else {
      tEl = THREE.MathUtils.degToRad(57);
      tAz = azSpin.current;
      tRad = 39;
    }
    el.current = damp(el.current, tEl, 1.8, dt);
    az.current = damp(az.current, tAz, 1.8, dt);
    rad.current = damp(rad.current, tRad, 1.8, dt);

    const ce = Math.cos(el.current);
    desired.set(
      Math.cos(az.current) * ce * rad.current,
      Math.sin(el.current) * rad.current + 1.0,
      Math.sin(az.current) * ce * rad.current
    );

    // position rides the spherical rig directly (crisp orbit, no chase wobble);
    // the blend only eases the intro and the return from first person
    blend.current = Math.min(1, blend.current + dt / 1.3);
    if (blend.current < 1) {
      camera.position.lerpVectors(blendFrom.current, desired, easeInOut(blend.current));
    } else {
      camera.position.copy(desired);
    }
    dampVec(look.current, center, 4, dt);
    camera.lookAt(look.current);
  });
  return null;
}

// Hover-to-highlight the downed paths and click to drop into first person.
function DropInteraction() {
  const markerRef = useRef<THREE.Group>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const color = useMemo(
    () => new THREE.Color(theme === "night" ? "#d2dcff" : "#fff0c2"),
    [theme]
  );

  const hide = () => {
    if (markerRef.current) markerRef.current.visible = false;
    document.body.style.cursor = "";
  };

  const droppableAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = useStore.getState();
    if (s.mode !== "aerial" || s.phase !== "explore") return null;
    const pat = s.activePattern;
    const hit = pathHit(e.point.x, e.point.z, pat);
    return hit.dist < pat.radius * 1.3 ? hit : null;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const hit = droppableAt(e);
    if (hit) {
      markerRef.current.position.set(e.point.x, 0, e.point.z);
      markerRef.current.visible = true;
      document.body.style.cursor = "pointer";
    } else hide();
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const hit = droppableAt(e);
    if (hit) {
      useStore.getState().enterFirstPerson(e.point.x, e.point.z, Math.atan2(hit.tx, hit.tz));
      hide();
    }
  };

  useEffect(() => {
    if (mode !== "aerial") hide();
  }, [mode]);

  useFrame((state) => {
    if (markerRef.current?.visible) {
      const p = 1 + Math.sin(state.clock.elapsedTime * 3.5) * 0.12;
      ringRef.current.scale.setScalar(p);
      (ringRef.current.material as THREE.MeshBasicMaterial).color.copy(color);
    }
  });

  return (
    <>
      {/* invisible but event-receiving plane over the field */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        onPointerMove={onMove}
        onPointerOut={hide}
        onClick={onClick}
      >
        <circleGeometry args={[60, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={markerRef} visible={false}>
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[1.0, 1.55, 48]} />
          <meshBasicMaterial
            color="#d2dcff"
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 2.4, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.45, 1.0, 4]} />
          <meshBasicMaterial
            color="#d2dcff"
            transparent
            opacity={0.7}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  );
}

// Background, fog, lights and the moon — all lerp smoothly between palettes so
// toggling day/night feels like the light actually changing.
function Atmosphere() {
  const { scene } = useThree();
  const theme = useStore((s) => s.theme);
  const pal = paletteFor(theme);
  // captured once → JSX boots straight into the load-time palette (no flash)
  const init = useRef(paletteFor(useStore.getState().theme)).current;

  const hemi = useRef<THREE.HemisphereLight>(null!);
  const amb = useRef<THREE.AmbientLight>(null!);
  const dir = useRef<THREE.DirectionalLight>(null!);

  const t = useMemo(
    () => ({
      bg: new THREE.Color(pal.background),
      fog: new THREE.Color(pal.fogColor),
      hemiSky: new THREE.Color(pal.hemiSky),
      hemiGround: new THREE.Color(pal.hemiGround),
      amb: new THREE.Color(pal.ambientColor),
      dir: new THREE.Color(pal.dirColor),
    }),
    [pal]
  );

  useEffect(() => {
    if (!scene.background) scene.background = new THREE.Color(init.background);
    if (!scene.fog) scene.fog = new THREE.Fog(init.fogColor, init.fogNear, init.fogFar);
  }, [scene, init]);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0001, dt);
    (scene.background as THREE.Color)?.lerp(t.bg, k);
    const fog = scene.fog as THREE.Fog;
    if (fog) {
      fog.color.lerp(t.fog, k);
      fog.near = THREE.MathUtils.damp(fog.near, pal.fogNear, 3, dt);
      fog.far = THREE.MathUtils.damp(fog.far, pal.fogFar, 3, dt);
    }
    if (hemi.current) {
      hemi.current.color.lerp(t.hemiSky, k);
      hemi.current.groundColor.lerp(t.hemiGround, k);
      hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, pal.hemiInt, 3, dt);
    }
    if (amb.current) {
      amb.current.color.lerp(t.amb, k);
      amb.current.intensity = THREE.MathUtils.damp(amb.current.intensity, pal.ambientInt, 3, dt);
    }
    if (dir.current) {
      dir.current.color.lerp(t.dir, k);
      dir.current.intensity = THREE.MathUtils.damp(dir.current.intensity, pal.dirInt, 3, dt);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[init.hemiSky, init.hemiGround, init.hemiInt]} />
      <ambientLight ref={amb} color={init.ambientColor} intensity={init.ambientInt} />
      <directionalLight ref={dir} position={[-34, 30, 22]} intensity={init.dirInt} color={init.dirColor} />
    </>
  );
}

// soft round sprite so the drifting particles are circles, not GL squares
function makeDotTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function Pollen() {
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const theme = useStore((s) => s.theme);
  const targetCol = useMemo(() => new THREE.Color(paletteFor(theme).pollen), [theme]);
  const initPollen = useRef(paletteFor(useStore.getState().theme).pollen).current;
  const dotTex = useMemo(makeDotTexture, []);
  const COUNT = 460;
  const { geometry, velocities } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      velocities[i] = 0.2 + Math.random() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geometry, velocities };
  }, []);

  useFrame((state, dt) => {
    const arr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const tm = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = arr.getY(i) + velocities[i] * dt * 0.6;
      const x = arr.getX(i) + Math.sin(tm * 0.3 + i) * dt * 0.25;
      if (y > 17) y = 0;
      arr.setY(i, y);
      arr.setX(i, x);
    }
    arr.needsUpdate = true;
    if (matRef.current) matRef.current.color.lerp(targetCol, 1 - Math.pow(0.0001, dt));
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        color={initPollen}
        map={dotTex}
        alphaMap={dotTex}
        size={0.16}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export default function Scene() {
  return (
    <>
      <Atmosphere />
      <Sky />
      <Ground />
      <CropField />
      <Orbs />
      <Pollen />
      <DropInteraction />

      <CameraSystem />
      <FormationDriver />
    </>
  );
}
