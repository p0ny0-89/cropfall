import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "./store";

// Everything here lives in a group pinned to the camera position, so the sky
// sits at infinity (no parallax as you walk the field) and always surrounds
// the viewer. A single `nightMix` (0 day → 1 night) drives all the fades.

const DOME_R = 480;
const STAR_R = 300;
const STAR_COUNT = 2200;

const dayHorizon = new THREE.Color("#c5a466"); // == fog/bg, so the field blends
const dayZenith = new THREE.Color("#b9c3c8"); // soft pale sky
const nightHorizon = new THREE.Color("#1c1e40");
const nightZenith = new THREE.Color("#080a1e");

export default function Sky() {
  const { camera, gl } = useThree();
  const theme = useStore((s) => s.theme);
  const group = useRef<THREE.Group>(null!);
  const nightMix = useRef(theme === "night" ? 1 : 0);

  // ---- gradient dome ----
  const domeUniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
    }),
    []
  );

  // ---- starfield ----
  const starUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixel: { value: Math.min(gl.getPixelRatio?.() ?? 1, 2) },
    }),
    [gl]
  );

  const starGeo = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const phase = new Float32Array(STAR_COUNT);
    const col = new Float32Array(STAR_COUNT * 3);
    const c = new THREE.Color();
    let n = 0;
    while (n < STAR_COUNT) {
      // uniform sphere direction, keep the upper dome (a few below the horizon)
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a));
      if (dir.y < -0.12) continue;
      pos[n * 3] = dir.x * STAR_R;
      pos[n * 3 + 1] = dir.y * STAR_R;
      pos[n * 3 + 2] = dir.z * STAR_R;
      size[n] = (0.6 + Math.random() * 2.2) * (Math.random() < 0.08 ? 2.4 : 1); // a few bright ones
      phase[n] = Math.random() * Math.PI * 2;
      // mostly cool-white, a sprinkle of warm/blue
      const tint = Math.random();
      if (tint < 0.12) c.setRGB(1.0, 0.85, 0.62);
      else if (tint < 0.28) c.setRGB(0.74, 0.82, 1.0);
      else c.setRGB(0.95, 0.97, 1.0);
      col[n * 3] = c.r;
      col[n * 3 + 1] = c.g;
      col[n * 3 + 2] = c.b;
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_R + 1);
    return g;
  }, []);

  // ---- moon ----
  const moonRef = useRef<THREE.Group>(null!);
  const moonCore = useRef<THREE.Mesh>(null!);
  const moonHalo = useRef<THREE.Mesh>(null!);
  const moonGlow = useRef<THREE.Mesh>(null!);

  // ---- planets ----
  const planetRefs = useRef<THREE.Mesh[]>([]);
  const planets = useMemo(
    () => [
      { pos: new THREE.Vector3(0.62, 0.26, 0.74).multiplyScalar(360), r: 5.5, color: "#bd7048", op: 0.7 },
      { pos: new THREE.Vector3(-0.72, 0.16, 0.4).multiplyScalar(360), r: 3.4, color: "#7d92cf", op: 0.55 },
    ],
    []
  );

  // ---- shooting stars (pool of camera-facing additive lines) ----
  const meteors = useMemo(() => {
    const arr: {
      line: THREE.Line;
      active: boolean;
      t: number;
      life: number;
      head: THREE.Vector3;
      vel: THREE.Vector3;
    }[] = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      arr.push({ line, active: false, t: 0, life: 0, head: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    return arr;
  }, []);
  const meteorTimer = useRef(2.5);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    if (group.current) group.current.position.copy(camera.position);
    nightMix.current = THREE.MathUtils.damp(nightMix.current, theme === "night" ? 1 : 0, 2, dt);
    const nm = nightMix.current;

    // dome gradient
    domeUniforms.uHorizon.value.copy(dayHorizon).lerp(nightHorizon, nm);
    domeUniforms.uZenith.value.copy(dayZenith).lerp(nightZenith, nm);

    // stars
    starUniforms.uTime.value = state.clock.elapsedTime;
    starUniforms.uOpacity.value = nm;

    // moon
    if (moonRef.current) {
      const co = moonCore.current.material as THREE.MeshBasicMaterial;
      const ho = moonHalo.current.material as THREE.MeshBasicMaterial;
      const go = moonGlow.current.material as THREE.MeshBasicMaterial;
      co.opacity = nm;
      ho.opacity = nm * 0.5;
      go.opacity = nm * 0.32;
      moonRef.current.visible = nm > 0.01;
      moonGlow.current.lookAt(camera.position);
    }

    // planets
    for (let i = 0; i < planets.length; i++) {
      const m = planetRefs.current[i];
      if (!m) continue;
      (m.material as THREE.MeshBasicMaterial).opacity = nm * planets[i].op;
      m.visible = nm > 0.01;
    }

    // shooting stars
    meteorTimer.current -= dt;
    if (meteorTimer.current <= 0) {
      if (nm > 0.45) {
        const m = meteors.find((x) => !x.active);
        if (m) {
          const a = Math.random() * Math.PI * 2;
          const hy = 0.45 + Math.random() * 0.4;
          const hr = Math.sqrt(Math.max(0, 1 - hy * hy));
          m.head.set(Math.cos(a) * hr, hy, Math.sin(a) * hr).multiplyScalar(STAR_R - 10);
          // travel roughly across + downward
          const da = a + (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.6);
          m.vel
            .set(Math.cos(da), -0.35 - Math.random() * 0.3, Math.sin(da))
            .normalize()
            .multiplyScalar(230 + Math.random() * 140);
          m.life = 0.5 + Math.random() * 0.6;
          m.t = 0;
          m.active = true;
        }
      }
      meteorTimer.current = 3.5 + Math.random() * 9;
    }
    for (const m of meteors) {
      if (!m.active) {
        m.line.visible = false;
        continue;
      }
      m.t += dt;
      if (m.t >= m.life) {
        m.active = false;
        m.line.visible = false;
        continue;
      }
      m.line.visible = nm > 0.05;
      m.head.addScaledVector(m.vel, dt);
      const fade = Math.sin((m.t / m.life) * Math.PI) * nm;
      tmp.copy(m.head).addScaledVector(m.vel, -0.07); // short trail
      const p = m.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      p.setXYZ(0, m.head.x, m.head.y, m.head.z);
      p.setXYZ(1, tmp.x, tmp.y, tmp.z);
      p.needsUpdate = true;
      const cAttr = m.line.geometry.getAttribute("color") as THREE.BufferAttribute;
      cAttr.setXYZ(0, fade, fade, fade * 1.1); // bright head
      cAttr.setXYZ(1, 0, 0, 0); // transparent tail (additive)
      cAttr.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      {/* gradient dome */}
      <mesh renderOrder={-10}>
        <sphereGeometry args={[DOME_R, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          uniforms={domeUniforms}
          vertexShader={`
            varying float vH;
            void main(){
              vH = normalize(position).y;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 uHorizon; uniform vec3 uZenith;
            varying float vH;
            void main(){
              float t = smoothstep(-0.04, 0.55, vH);
              gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
            }
          `}
        />
      </mesh>

      {/* stars */}
      <points geometry={starGeo} frustumCulled={false} renderOrder={-9}>
        <shaderMaterial
          transparent
          depthWrite={false}
          fog={false}
          blending={THREE.AdditiveBlending}
          uniforms={starUniforms}
          vertexShader={`
            attribute float aSize; attribute float aPhase; attribute vec3 aColor;
            uniform float uTime; uniform float uPixel;
            varying float vTw; varying vec3 vCol;
            void main(){
              float tw = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
              vTw = tw; vCol = aColor;
              gl_PointSize = aSize * (0.7 + 0.5 * tw) * uPixel;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uOpacity;
            varying float vTw; varying vec3 vCol;
            void main(){
              vec2 d = gl_PointCoord - 0.5;
              float r = dot(d, d);
              if (r > 0.25) discard;
              float a = smoothstep(0.25, 0.0, r);
              gl_FragColor = vec4(vCol, a * vTw * uOpacity);
            }
          `}
        />
      </points>

      {/* moon */}
      <group ref={moonRef} position={[-150, 120, -250]}>
        <mesh ref={moonCore} renderOrder={-8}>
          <sphereGeometry args={[15, 32, 32]} />
          <meshBasicMaterial color="#eef2ff" transparent toneMapped={false} fog={false} depthWrite={false} />
        </mesh>
        <mesh ref={moonHalo} renderOrder={-8}>
          <sphereGeometry args={[19, 32, 32]} />
          <meshBasicMaterial
            color="#aebfff"
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
        <mesh ref={moonGlow} renderOrder={-9}>
          <planeGeometry args={[110, 110]} />
          <meshBasicMaterial
            color="#8aa0e6"
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
            map={glowTexture()}
          />
        </mesh>
      </group>

      {/* distant planets */}
      {planets.map((p, i) => (
        <mesh
          key={i}
          position={p.pos}
          ref={(m) => m && (planetRefs.current[i] = m)}
          renderOrder={-8}
        >
          <sphereGeometry args={[p.r, 24, 24]} />
          <meshBasicMaterial color={p.color} transparent toneMapped={false} fog={false} depthWrite={false} />
        </mesh>
      ))}

      {/* shooting stars */}
      {meteors.map((m, i) => (
        <primitive key={i} object={m.line} />
      ))}
    </group>
  );
}

// soft radial glow sprite for the moon halo
let _glow: THREE.CanvasTexture | null = null;
function glowTexture() {
  if (_glow) return _glow;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.25, "rgba(180,196,255,0.35)");
  g.addColorStop(1, "rgba(180,196,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
