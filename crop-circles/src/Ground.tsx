import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FIELD_RADIUS, getPattern, type Pattern } from "./patterns";
import { useStore } from "./store";

const TEX = 1024;
const WORLD = (FIELD_RADIUS + 4) * 2; // ground span in world units

// Bake two textures from the pattern strokes:
//  - mask  (red channel): how strongly the soil is flattened here
//  - time  (green channel via separate canvas): when the orb reaches it (min)
function bakeTextures(pattern: Pattern) {
  const maskC = document.createElement("canvas");
  maskC.width = maskC.height = TEX;
  const mctx = maskC.getContext("2d")!;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, TEX, TEX);

  const timeC = document.createElement("canvas");
  timeC.width = timeC.height = TEX;
  const tctx = timeC.getContext("2d")!;
  tctx.fillStyle = "#fff"; // 1.0 = "never reached"
  tctx.fillRect(0, 0, TEX, TEX);

  const toPx = (w: number) => ((w + WORLD / 2) / WORLD) * TEX;
  const scale = TEX / WORLD;

  const drawStroke = (ctx: CanvasRenderingContext2D, pts: number[][], width: number, stroke: string) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = toPx(pts[i][0]);
      const y = toPx(pts[i][1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  for (const s of pattern.strokes) {
    const w = pattern.radius * 2 * scale;
    // soft mask: draw white path (additive-ish via lighter)
    mctx.globalCompositeOperation = "lighter";
    drawStroke(mctx, s.points, w, "rgba(180,180,180,1)");
    // time: darken keeps the minimum (earliest) arrival
    tctx.globalCompositeOperation = "darken";
    const tMid = (s.tStart + s.tEnd) / 2;
    const g = Math.round(tMid * 255);
    drawStroke(tctx, s.points, w, `rgb(${g},${g},${g})`);
  }

  const maskTex = new THREE.CanvasTexture(maskC);
  const timeTex = new THREE.CanvasTexture(timeC);
  maskTex.flipY = timeTex.flipY = false;
  maskTex.needsUpdate = timeTex.needsUpdate = true;
  return { maskTex, timeTex };
}

export default function Ground() {
  const patternId = useStore((s) => s.patternId);
  const uniforms = useRef({
    uProgress: { value: 0 },
    uMask: { value: null as THREE.Texture | null },
    uTime: { value: null as THREE.Texture | null },
    uSoil: { value: new THREE.Color("#6b5a32") },
    uSwirl: { value: new THREE.Color("#c9ad63") },
    uClock: { value: 0 },
  });

  const { maskTex, timeTex } = useMemo(() => bakeTextures(getPattern(patternId)), [patternId]);
  uniforms.current.uMask.value = maskTex;
  uniforms.current.uTime.value = timeTex;

  const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms.current);
    shader.vertexShader = `varying vec2 vUvG;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>\n vUvG = uv;`
    );
    shader.fragmentShader =
      `varying vec2 vUvG; uniform float uProgress; uniform float uClock;
       uniform sampler2D uMask; uniform sampler2D uTime;
       uniform vec3 uSoil; uniform vec3 uSwirl;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       float mask = texture2D(uMask, vUvG).r;
       float arr = texture2D(uTime, vUvG).g;
       float carved = step(arr, uProgress) * smoothstep(0.05, 0.45, mask);
       // brushed swirl streaks in the flattened soil
       float streak = 0.5 + 0.5 * sin((vUvG.x + vUvG.y) * 220.0 + uClock * 0.4);
       vec3 flatCol = mix(uSoil, uSwirl, 0.5 + 0.4 * streak);
       diffuseColor.rgb = mix(diffuseColor.rgb, flatCol, carved * 0.9);
      `
    );
  };

  useFrame((state) => {
    uniforms.current.uProgress.value = useStore.getState().formProgress;
    uniforms.current.uClock.value = state.clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[WORLD, WORLD, 1, 1]} />
      <meshStandardMaterial
        color="#7a6838"
        roughness={1}
        metalness={0}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
  );
}
