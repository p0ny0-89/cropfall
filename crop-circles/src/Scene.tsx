import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import CropField from "./CropField";
import Ground from "./Ground";
import Orbs from "./Orbs";
import { useStore } from "./store";

const FORM_DURATION = 6.5; // seconds for a full formation

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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

// Cinematic camera: auto-orbiting aerial during formation, pointer parallax
// during exploration (cursor low = drop toward ground level).
function CameraRig() {
  const { camera, pointer } = useThree();
  const el = useRef(THREE.MathUtils.degToRad(62));
  const az = useRef(0);
  const rad = useRef(46);
  const center = useMemo(() => new THREE.Vector3(0, 1.2, 0), []);

  useFrame((state, dt) => {
    const phase = useStore.getState().phase;
    let tEl: number, tAz: number, tRad: number;

    if (phase === "explore") {
      // pointer.y up (=1) -> aerial top-down; down (=-1) -> ground level
      const py = (pointer.y + 1) / 2;
      tEl = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(15, 66, py));
      tAz = THREE.MathUtils.degToRad(35) * pointer.x + state.clock.elapsedTime * 0.02;
      tRad = THREE.MathUtils.lerp(22, 40, py);
    } else {
      // forming / intro: strong aerial angle, slow orbit
      tEl = THREE.MathUtils.degToRad(60);
      tAz = state.clock.elapsedTime * 0.07;
      tRad = 46;
    }

    el.current = THREE.MathUtils.damp(el.current, tEl, 2.2, dt);
    az.current = THREE.MathUtils.damp(az.current, tAz, 2.2, dt);
    rad.current = THREE.MathUtils.damp(rad.current, tRad, 2.2, dt);

    const ce = Math.cos(el.current);
    camera.position.set(
      Math.cos(az.current) * ce * rad.current,
      Math.sin(el.current) * rad.current + 1.0,
      Math.sin(az.current) * ce * rad.current
    );
    camera.lookAt(center);
  });
  return null;
}

function Pollen() {
  const ref = useRef<THREE.Points>(null!);
  const COUNT = 380;
  const { geometry, velocities } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      velocities[i] = 0.2 + Math.random() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geometry, velocities };
  }, []);

  useFrame((state, dt) => {
    const arr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = arr.getY(i) + velocities[i] * dt * 0.6;
      let x = arr.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.25;
      if (y > 15) y = 0;
      arr.setY(i, y);
      arr.setX(i, x);
    }
    arr.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color="#ffe6ad"
        size={0.14}
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
      <color attach="background" args={["#caa86a"]} />
      <fog attach="fog" args={["#d8bd84", 30, 95]} />

      <hemisphereLight args={["#fff0cf", "#5a4a26", 0.85]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[-30, 24, 18]}
        intensity={1.8}
        color="#ffdca0"
      />

      <Ground />
      <CropField />
      <Orbs />
      <Pollen />

      <CameraRig />
      <FormationDriver />
    </>
  );
}
