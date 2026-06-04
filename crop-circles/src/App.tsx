import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene from "./Scene";
import ControlPanel from "./ui/ControlPanel";

export default function App() {
  return (
    <div className="app">
      <Canvas
        dpr={[1, 1.8]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 42, near: 0.1, far: 300, position: [0, 30, 46] }}
      >
        <Scene />
      </Canvas>
      <ControlPanel />
    </div>
  );
}
