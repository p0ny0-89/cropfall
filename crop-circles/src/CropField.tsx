import { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { computeCarve } from "./patterns";
import { useStore } from "./store";
import { paletteFor } from "./theme";

// Single-quad blades (cheaper than the old cross) let us afford a very dense
// core plus a sparse far skirt that runs the field out past the horizon.
const CORE_R = 54; // densely planted zone that covers everything you can see
const CORE_SPACING = 0.185;
const FAR_R = 90; // sparse skirt; fully swallowed by fog, just hides the edge
const FAR_SPACING = 0.55;
const COUNT_TARGET = 400000;
// thin the planting on phones so the high desktop density doesn't tax weak GPUs
const PERF_MULT =
  typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    ? 1.7
    : 1;

// build a thin vertical blade quad, base at y=0
function makeBlade() {
  const g = new THREE.PlaneGeometry(0.06, 1, 1, 3);
  g.translate(0, 0.5, 0);
  return g;
}

export default function CropField() {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const activePattern = useStore((s) => s.activePattern);
  const theme = useStore((s) => s.theme);

  const target = useMemo(() => {
    const p = paletteFor(theme);
    return {
      colA: new THREE.Color(p.bladeA),
      colB: new THREE.Color(p.bladeB),
      flatA: new THREE.Color(p.bladeFlatA),
      flatB: new THREE.Color(p.bladeFlatB),
      windAmp: p.windAmp,
    };
  }, [theme]);

  // scatter dense stalks on a jittered grid inside the field disc
  const { geometry, count, positions, attrs, uniforms } = useMemo(() => {
    const geometry = makeBlade();
    const ip = paletteFor(useStore.getState().theme); // boot straight into theme
    const px: number[] = [];
    const yaw: number[] = [];
    const height: number[] = [];
    const phase: number[] = [];
    const rand: number[] = [];

    const plant = (x: number, z: number, dist: number) => {
      // only the very outer rim thins, and it's deep in the fog anyway
      const edge = THREE.MathUtils.clamp((FAR_R - dist) / 6, 0, 1);
      px.push(x, z);
      yaw.push(Math.random() * Math.PI * 2);
      height.push((1.15 + Math.random() * 0.75) * (0.35 + 0.65 * edge));
      phase.push(Math.random() * Math.PI * 2);
      rand.push(Math.random());
    };

    const coreSp = CORE_SPACING * PERF_MULT;
    const farSp = FAR_SPACING * PERF_MULT;

    // dense core
    let half = Math.ceil(CORE_R / coreSp);
    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const x = gx * coreSp + (Math.random() - 0.5) * coreSp * 0.95;
        const z = gz * coreSp + (Math.random() - 0.5) * coreSp * 0.95;
        const dist = Math.hypot(x, z);
        if (dist <= CORE_R) plant(x, z, dist);
      }
    }
    // sparse skirt running out to the horizon
    half = Math.ceil(FAR_R / farSp);
    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const x = gx * farSp + (Math.random() - 0.5) * farSp * 0.95;
        const z = gz * farSp + (Math.random() - 0.5) * farSp * 0.95;
        const dist = Math.hypot(x, z);
        if (dist > CORE_R && dist <= FAR_R) plant(x, z, dist);
      }
    }
    const count = Math.min(px.length / 2, COUNT_TARGET);
    const positions = new Float32Array(px.slice(0, count * 2));
    const attrs = {
      aHeight: new Float32Array(height.slice(0, count)),
      aYaw: new Float32Array(yaw.slice(0, count)),
      aPhase: new Float32Array(phase.slice(0, count)),
      aRand: new Float32Array(rand.slice(0, count)),
      aFlatten: new Float32Array(count),
      aCarveT: new Float32Array(count),
      aDir: new Float32Array(count * 2),
    };
    const uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uWind: { value: new THREE.Vector2(0.85, 0.52) },
      uWindAmp: { value: ip.windAmp },
      uColA: { value: new THREE.Color(ip.bladeA) },
      uColB: { value: new THREE.Color(ip.bladeB) },
      uFlatA: { value: new THREE.Color(ip.bladeFlatA) },
      uFlatB: { value: new THREE.Color(ip.bladeFlatB) },
    };
    return { geometry, count, positions, attrs, uniforms };
  }, []);

  // wire instanced attributes + per-instance translation matrix
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const g = mesh.geometry;
    g.setAttribute("aHeight", new THREE.InstancedBufferAttribute(attrs.aHeight, 1));
    g.setAttribute("aYaw", new THREE.InstancedBufferAttribute(attrs.aYaw, 1));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(attrs.aPhase, 1));
    g.setAttribute("aRand", new THREE.InstancedBufferAttribute(attrs.aRand, 1));
    g.setAttribute("aFlatten", new THREE.InstancedBufferAttribute(attrs.aFlatten, 1));
    g.setAttribute("aCarveT", new THREE.InstancedBufferAttribute(attrs.aCarveT, 1));
    g.setAttribute("aDir", new THREE.InstancedBufferAttribute(attrs.aDir, 2));

    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(positions[i * 2], 0, positions[i * 2 + 1]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FAR_R + 12);
  }, [attrs, count, positions]);

  // recompute carve targets whenever the active pattern changes (preset or custom)
  useLayoutEffect(() => {
    const carve = computeCarve(positions, count, activePattern, attrs.aRand);
    attrs.aFlatten.set(carve.flatten);
    attrs.aCarveT.set(carve.carveT);
    for (let i = 0; i < count; i++) {
      attrs.aDir[i * 2] = carve.dirX[i];
      attrs.aDir[i * 2 + 1] = carve.dirZ[i];
    }
    const g = meshRef.current.geometry;
    (g.getAttribute("aFlatten") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aCarveT") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aDir") as THREE.BufferAttribute).needsUpdate = true;
  }, [activePattern, attrs, count, positions]);

  // inject bending + coloring into a standard (lit) material
  const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      `
      attribute float aHeight; attribute float aYaw; attribute float aPhase;
      attribute float aRand; attribute float aFlatten; attribute float aCarveT;
      attribute vec2 aDir;
      uniform float uTime; uniform float uProgress;
      uniform vec2 uWind; uniform float uWindAmp;
      varying float vFlat; varying float vRand; varying float vY;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      float y01 = position.y;
      // taper to a point so blades read as stalks up close, not flat slabs
      float taper = 1.0 - y01 * 0.62;
      float bx = position.x * taper; float bz = position.z;
      float cy = cos(aYaw); float sy = sin(aYaw);
      vec2 footprint = mat2(cy, -sy, sy, cy) * vec2(bx, bz);

      float wx = instanceMatrix[3][0];
      float wz = instanceMatrix[3][2];

      float fAmt = smoothstep(aCarveT, aCarveT + 0.06, uProgress) * aFlatten;
      vFlat = fAmt; vRand = aRand; vY = y01;

      // (flattened straw keeps the same width as upright stalks — density, not
      //  thickness, fills the lay)

      float hgt = y01 * aHeight;
      float sway = (y01 * y01) * uWindAmp * (0.55 + 0.6 * aRand)
                 * sin(uTime * 1.7 + aPhase + wx * 0.35 + wz * 0.22);
      vec2 swayOff = normalize(uWind) * sway * (1.0 - fAmt * 0.85);

      // tip the stalk over along its woven brush direction when flattened
      vec2 flatOff = aDir * hgt * fAmt * 0.95;
      float curl = sin(y01 * 3.14159 + aRand * 6.28) * 0.12 * fAmt;

      vec3 transformed = vec3(
        footprint.x + swayOff.x + flatOff.x,
        hgt * (1.0 - fAmt * 0.9) + curl,
        footprint.y + swayOff.y + flatOff.y
      );
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `
      vec3 objectNormal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), aFlatten * 0.85));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif
      `
    );

    shader.fragmentShader =
      `
      uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uFlatA; uniform vec3 uFlatB;
      varying float vFlat; varying float vRand; varying float vY;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      vec3 standCol = mix(uColA, uColB, vRand);
      vec3 flatCol = mix(uFlatA, uFlatB, vRand);
      vec3 cc = mix(standCol, flatCol, vFlat);
      cc *= mix(0.5, 1.05, vY);
      diffuseColor.rgb *= cc;
      `
    );
  };

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uProgress.value = useStore.getState().formProgress;
    const k = 1 - Math.pow(0.0001, dt); // smooth day/night transition
    uniforms.uColA.value.lerp(target.colA, k);
    uniforms.uColB.value.lerp(target.colB, k);
    uniforms.uFlatA.value.lerp(target.flatA, k);
    uniforms.uFlatB.value.lerp(target.flatB, k);
    uniforms.uWindAmp.value = THREE.MathUtils.damp(
      uniforms.uWindAmp.value,
      target.windAmp,
      3,
      dt
    );
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, count]}
      frustumCulled={false}
      receiveShadow
    >
      <meshStandardMaterial
        color="#ffffff"
        roughness={0.85}
        metalness={0.0}
        side={THREE.DoubleSide}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}
