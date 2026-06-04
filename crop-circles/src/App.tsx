import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene from "./Scene";
import ControlPanel from "./ui/ControlPanel";
import Minimap from "./ui/Minimap";
import SoundToggle from "./ui/SoundToggle";
import { useStore } from "./store";

export default function App() {
  const theme = useStore((s) => s.theme);
  return (
    <div className={"app" + (theme === "night" ? " night" : "")}>
      <Canvas
        dpr={[1, 1.8]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{ fov: 42, near: 0.1, far: 1600, position: [0, 30, 46] }}
      >
        <Scene />
      </Canvas>
      <Minimap />
      <SoundToggle />
      <ControlPanel />
    </div>
  );
}
