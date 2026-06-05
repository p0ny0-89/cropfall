import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "./store";
import { paletteFor } from "./theme";

// Soil under the crops. It fades out (alpha) radially before its edge so the
// plane never terminates in a hard line against the sky — the sky dome shows
// through and the horizon blends seamlessly.
const FADE_INNER = 70; // fully opaque within this radius
const FADE_OUTER = 150; // fully transparent beyond this

export default function Ground() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const theme = useStore((s) => s.theme);
  const target = useMemo(() => new THREE.Color(paletteFor(theme).groundColor), [theme]);
  const initColor = useRef(paletteFor(useStore.getState().theme).groundColor).current;

  useFrame((_, dt) => {
    if (matRef.current) matRef.current.color.lerp(target, 1 - Math.pow(0.0001, dt));
  });

  const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uInner = { value: FADE_INNER };
    shader.uniforms.uOuter = { value: FADE_OUTER };
    shader.vertexShader =
      "varying float vGroundDist;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec4 wPos = modelMatrix * vec4(transformed, 1.0);
         vGroundDist = length(wPos.xz);`
      );
    shader.fragmentShader =
      "varying float vGroundDist;\nuniform float uInner;\nuniform float uOuter;\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
         gl_FragColor.a *= 1.0 - smoothstep(uInner, uOuter, vGroundDist);`
      );
  };

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <circleGeometry args={[FADE_OUTER + 10, 96]} />
      <meshStandardMaterial
        ref={matRef}
        color={initColor}
        roughness={1}
        metalness={0}
        transparent
        depthWrite={false}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
  );
}
