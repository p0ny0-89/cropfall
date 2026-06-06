import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene from "./Scene";
import ControlPanel from "./ui/ControlPanel";
import DrawPad from "./ui/DrawPad";
import Minimap from "./ui/Minimap";
import SoundToggle from "./ui/SoundToggle";
import { useStore } from "./store";
import { drawingFromHash, strokesToPaths } from "./share";

export default function App() {
  const theme = useStore((s) => s.theme);

  // if the page was opened from a shared drawing link, carve it on load
  useEffect(() => {
    const d = drawingFromHash();
    if (!d) return;
    const paths = strokesToPaths(d.strokes);
    if (!paths.length) return;
    const id = window.setTimeout(() => useStore.getState().carveDrawing(paths, d.brush), 250);
    return () => window.clearTimeout(id);
  }, []);

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
      <DrawPad />
    </div>
  );
}
