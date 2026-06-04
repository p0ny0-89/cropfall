import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import CropField from "./CropField";
import Ground from "./Ground";
import Orbs from "./Orbs";
import { useStore } from "./store";
import { DAY, paletteFor } from "./theme";

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
      const py = (pointer.y + 1) / 2;
      tEl = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(14, 66, py));
      tAz = THREE.MathUtils.degToRad(35) * pointer.x + state.clock.elapsedTime * 0.02;
      tRad = THREE.MathUtils.lerp(20, 40, py);
    } else {
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

// Background, fog, lights and the moon — all lerp smoothly between palettes so
// toggling day/night feels like the light actually changing.
function Atmosphere() {
  const { scene } = useThree();
  const theme = useStore((s) => s.theme);
  const pal = paletteFor(theme);

  const hemi = useRef<THREE.HemisphereLight>(null!);
  const amb = useRef<THREE.AmbientLight>(null!);
  const dir = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.Group>(null!);
  const moonCore = useRef<THREE.Mesh>(null!);
  const moonHalo = useRef<THREE.Mesh>(null!);

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
    if (!scene.background) scene.background = new THREE.Color(DAY.background);
    if (!scene.fog) scene.fog = new THREE.Fog(DAY.fogColor, DAY.fogNear, DAY.fogFar);
  }, [scene]);

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
    if (moonCore.current && moonHalo.current) {
      const cm = moonCore.current.material as THREE.MeshBasicMaterial;
      const hm = moonHalo.current.material as THREE.MeshBasicMaterial;
      cm.opacity = THREE.MathUtils.damp(cm.opacity, pal.moon, 3, dt);
      hm.opacity = THREE.MathUtils.damp(hm.opacity, pal.moon * 0.4, 3, dt);
      moon.current.visible = cm.opacity > 0.01;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff0cf", "#5a4a26", 0.85]} />
      <ambientLight ref={amb} intensity={0.28} />
      <directionalLight ref={dir} position={[-34, 30, 22]} intensity={1.7} color="#ffdca0" />

      {/* moon — only really visible at night */}
      <group ref={moon} position={[-78, 52, -96]}>
        <mesh ref={moonCore}>
          <sphereGeometry args={[10, 32, 32]} />
          <meshBasicMaterial color="#eaf0ff" transparent opacity={0} toneMapped={false} fog={false} />
        </mesh>
        <mesh ref={moonHalo}>
          <sphereGeometry args={[18, 32, 32]} />
          <meshBasicMaterial
            color="#9fb4ff"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      </group>
    </>
  );
}

function Pollen() {
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const theme = useStore((s) => s.theme);
  const targetCol = useMemo(() => new THREE.Color(paletteFor(theme).pollen), [theme]);
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
      <Atmosphere />
      <Ground />
      <CropField />
      <Orbs />
      <Pollen />

      <CameraRig />
      <FormationDriver />
    </>
  );
}
