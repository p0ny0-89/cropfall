import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "./store";
import { paletteFor } from "./theme";

// Plain soil that extends far past the crops and fades into the haze. The
// flattened stalks themselves draw the pattern — there is no painted graphic.
export default function Ground() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const theme = useStore((s) => s.theme);
  const target = useMemo(() => new THREE.Color(paletteFor(theme).groundColor), [theme]);
  const initColor = useRef(paletteFor(useStore.getState().theme).groundColor).current;

  useFrame((_, dt) => {
    if (matRef.current)
      matRef.current.color.lerp(target, 1 - Math.pow(0.0001, dt));
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <circleGeometry args={[260, 96]} />
      <meshStandardMaterial ref={matRef} color={initColor} roughness={1} metalness={0} />
    </mesh>
  );
}
