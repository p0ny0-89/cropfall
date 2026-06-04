import { useMemo, useRef, useLayoutEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD_RADIUS, computeCarve, getPattern } from "./patterns";
import { useStore } from "./store";

const COUNT_TARGET = 13000;

// build a thin cross-blade (two perpendicular vertical quads), base at y=0
function makeBlade() {
  const a = new THREE.PlaneGeometry(0.085, 1, 1, 5);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b])!;
  return g;
}

export default function CropField() {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const patternId = useStore((s) => s.patternId);

  // scatter stalks on a jittered grid inside the field disc
  const { geometry, count, positions, attrs, uniforms } = useMemo(() => {
    const geometry = makeBlade();
    const spacing = 0.42;
    const R = FIELD_RADIUS + 4;
    const half = Math.ceil(R / spacing);
    const px: number[] = [];
    const yaw: number[] = [];
    const height: number[] = [];
    const phase: number[] = [];
    const rand: number[] = [];
    for (let gx = -half; gx <= half; gx++) {
      for (let gz = -half; gz <= half; gz++) {
        const x = gx * spacing + (Math.random() - 0.5) * spacing * 0.9;
        const z = gz * spacing + (Math.random() - 0.5) * spacing * 0.9;
        if (x * x + z * z > R * R) continue;
        px.push(x, z);
        yaw.push(Math.random() * Math.PI * 2);
        height.push(1.25 + Math.random() * 0.7);
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
      uColA: { value: new THREE.Color("#b9982f") },
      uColB: { value: new THREE.Color("#d9bb52") },
      uFlatA: { value: new THREE.Color("#cdb15e") },
      uFlatB: { value: new THREE.Color("#e6d089") },
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
    // generous bounds so it never gets frustum-culled while bending
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FIELD_RADIUS + 8);
  }, [attrs, count, positions]);

  // recompute carve targets whenever the pattern changes
  useLayoutEffect(() => {
    const pattern = getPattern(patternId);
    const carve = computeCarve(positions, count, pattern);
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
      // yaw the thin cross footprint
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

      // tip the stalk over along its brushed direction when flattened
      vec2 flatOff = aDir * hgt * fAmt * 0.95;
      // tiny curl so flattened straw isn't dead-flat
      float curl = sin(y01 * 3.14159 + aRand * 6.28) * 0.12 * fAmt;

      vec3 transformed = vec3(
        footprint.x + swayOff.x + flatOff.x,
        hgt * (1.0 - fAmt * 0.9) + curl,
        footprint.y + swayOff.y + flatOff.y
      );
      `
    );

    // laid-down straw catches light from above
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
      cc *= mix(0.5, 1.05, vY);           // darker toward the soil
      diffuseColor.rgb *= cc;
      `
    );
  };

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uProgress.value = useStore.getState().formProgress;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, count]}
      frustumCulled={false}
      receiveShadow
    >
      <meshStandardMaterial
        ref={matRef}
        color="#ffffff"
        roughness={0.85}
        metalness={0.0}
        side={THREE.DoubleSide}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}
