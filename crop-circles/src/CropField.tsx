import { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { computeCarve, getPattern } from "./patterns";
import { useStore } from "./store";
import { paletteFor } from "./theme";

const COUNT_TARGET = 52000;
const SCATTER_R = 48; // crops reach well past the pattern; fog hides the rim
const EDGE_FADE = 9; // stalks shrink to nothing over the last few metres

// build a thin cross-blade (two perpendicular vertical quads), base at y=0
function makeBlade() {
  const a = new THREE.PlaneGeometry(0.07, 1, 1, 4);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return mergeGeometries([a, b])!;
}

export default function CropField() {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const patternId = useStore((s) => s.patternId);
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
    const spacing = 0.36;
    const half = Math.ceil(SCATTER_R / spacing);
    const px: number[] = [];
    const yaw: number[] = [];
    const height: number[] = [];
    const phase: number[] = [];
    const rand: number[] = [];
    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const x = gx * spacing + (Math.random() - 0.5) * spacing * 0.95;
        const z = gz * spacing + (Math.random() - 0.5) * spacing * 0.95;
        const dist = Math.hypot(x, z);
        if (dist > SCATTER_R) continue;
        // soft rim so the field thins into the haze instead of clipping
        const edge = THREE.MathUtils.clamp((SCATTER_R - dist) / EDGE_FADE, 0, 1);
        const h = (1.15 + Math.random() * 0.75) * (0.25 + 0.75 * edge);
        px.push(x, z);
        yaw.push(Math.random() * Math.PI * 2);
        height.push(h);
        phase.push(Math.random() * Math.PI * 2);
        rand.push(Math.random());
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
      uWindAmp: { value: 0.32 },
      uColA: { value: new THREE.Color("#a98c2d") },
      uColB: { value: new THREE.Color("#cdaf4c") },
      uFlatA: { value: new THREE.Color("#c6a956") },
      uFlatB: { value: new THREE.Color("#e4cd83") },
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
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SCATTER_R + 12);
  }, [attrs, count, positions]);

  // recompute carve targets whenever the pattern changes
  useLayoutEffect(() => {
    const pattern = getPattern(patternId);
    const carve = computeCarve(positions, count, pattern, attrs.aRand);
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
  }, [patternId, attrs, count, positions]);

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
      float bx = position.x; float bz = position.z;
      float cy = cos(aYaw); float sy = sin(aYaw);
      vec2 footprint = mat2(cy, -sy, sy, cy) * vec2(bx, bz);

      float wx = instanceMatrix[3][0];
      float wz = instanceMatrix[3][2];

      float fAmt = smoothstep(aCarveT, aCarveT + 0.06, uProgress) * aFlatten;
      vFlat = fAmt; vRand = aRand; vY = y01;

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
