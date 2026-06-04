import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { NUM_ORBS, getPattern, type Stroke, type Vec2 } from "./patterns";
import { useStore } from "./store";
import { paletteFor } from "./theme";

const CARVE_Y = 2.4;
const HOVER_Y = 9;
const REST_Y = 26;

function strokePoint(pts: Vec2[], t: number): Vec2 {
  const m = pts.length;
  if (m === 1) return pts[0];
  const f = THREE.MathUtils.clamp(t, 0, 1) * (m - 1);
  const i = Math.floor(f);
  const j = Math.min(i + 1, m - 1);
  const a = f - i;
  return [pts[i][0] * (1 - a) + pts[j][0] * a, pts[i][1] * (1 - a) + pts[j][1] * a];
}

interface OrbVisual {
  group: THREE.Group;
  beam: THREE.Mesh;
  light: THREE.PointLight;
  halo: THREE.Mesh;
  core: THREE.Mesh;
}

export default function Orbs() {
  const patternId = useStore((s) => s.patternId);
  const theme = useStore((s) => s.theme);
  const refs = useRef<OrbVisual[]>([]);
  const opacity = useRef<number[]>(new Array(NUM_ORBS).fill(0));
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);

  // children mount before the parent group, so make sure the slot exists
  const slot = (o: number): OrbVisual => {
    refs.current[o] = refs.current[o] || ({} as OrbVisual);
    return refs.current[o];
  };

  // recolor orbs for day / moonlit night
  useEffect(() => {
    const p = paletteFor(theme);
    for (const v of refs.current) {
      if (!v) continue;
      (v.core.material as THREE.MeshBasicMaterial).color.set(p.orbCore);
      (v.halo.material as THREE.MeshBasicMaterial).color.set(p.orbHalo);
      v.light.color.set(p.orbLight);
      (v.beam.material as THREE.MeshBasicMaterial).color.set(p.orbBeam);
    }
  }, [theme]);

  // group strokes per orb, ordered by time
  const perOrb = useMemo(() => {
    const pat = getPattern(patternId);
    const lists: Stroke[][] = Array.from({ length: NUM_ORBS }, () => []);
    for (const s of pat.strokes) lists[s.orb % NUM_ORBS].push(s);
    for (const l of lists) l.sort((a, b) => a.tStart - b.tStart);
    return { lists, radius: pat.radius };
  }, [patternId]);

  useFrame((_, dt) => {
    const { phase, formProgress } = useStore.getState();
    const p = formProgress;
    for (let o = 0; o < NUM_ORBS; o++) {
      const v = refs.current[o];
      if (!v) continue;
      const strokes = perOrb.lists[o];

      let tx = 0,
        tz = 0,
        ty = REST_Y,
        active = false;

      if (strokes.length) {
        const first = strokes[0];
        const last = strokes[strokes.length - 1];
        if (p < first.tStart) {
          // flying in toward the first carve point
          const sp = strokePoint(first.points, 0);
          tx = sp[0];
          tz = sp[1];
          ty = THREE.MathUtils.lerp(REST_Y, HOVER_Y, THREE.MathUtils.clamp(p / Math.max(0.001, first.tStart), 0, 1));
        } else if (p > last.tEnd) {
          const sp = strokePoint(last.points, 1);
          tx = sp[0];
          tz = sp[1];
          ty = HOVER_Y;
        } else {
          // is an assigned stroke active right now?
          const cur = strokes.find((s) => p >= s.tStart && p <= s.tEnd);
          if (cur) {
            const lt = (p - cur.tStart) / Math.max(0.0001, cur.tEnd - cur.tStart);
            const sp = strokePoint(cur.points, lt);
            tx = sp[0];
            tz = sp[1];
            ty = CARVE_Y;
            active = true;
          } else {
            // travelling to the next stroke
            const next = strokes.find((s) => s.tStart > p) ?? last;
            const sp = strokePoint(next.points, 0);
            tx = sp[0];
            tz = sp[1];
            ty = HOVER_Y;
          }
        }
      }

      // exploration / idle: orbs drift up and fade away
      const wantVisible = phase === "forming" || (phase === "intro" && p > 0);
      const targetOpacity = wantVisible ? 1 : 0;
      if (!wantVisible) ty = REST_Y;
      opacity.current[o] = THREE.MathUtils.damp(opacity.current[o], targetOpacity, 3, dt);
      const op = opacity.current[o];

      tmpTarget.set(tx, ty, tz);
      v.group.position.lerp(tmpTarget, 1 - Math.pow(0.001, dt));

      // beam: stretch from orb down to the soil, only while actively carving
      const beamOn = active ? 1 : 0;
      const beamStrength = THREE.MathUtils.damp(
        (v.beam.material as THREE.MeshBasicMaterial).opacity,
        beamOn * 0.32 * op,
        6,
        dt
      );
      const bm = v.beam.material as THREE.MeshBasicMaterial;
      bm.opacity = beamStrength;
      const h = Math.max(0.5, v.group.position.y);
      v.beam.scale.set(1, h, 1);
      v.beam.position.y = -h / 2;

      v.light.intensity = (active ? 9 : 3.5) * op;
      const hm = v.halo.material as THREE.MeshBasicMaterial;
      hm.opacity = 0.5 * op;
      const pulse = 1 + Math.sin(performance.now() * 0.004 + o) * 0.12;
      v.halo.scale.setScalar(pulse);
      v.group.visible = op > 0.01;
    }
  });

  const radius = perOrb.radius;

  return (
    <>
      {Array.from({ length: NUM_ORBS }).map((_, o) => (
        <group
          key={o}
          ref={(g) => {
            if (g) slot(o).group = g;
          }}
        >
          {/* core */}
          <mesh ref={(m) => m && (slot(o).core = m)}>
            <sphereGeometry args={[0.45, 24, 24]} />
            <meshBasicMaterial color="#fff4d6" toneMapped={false} />
          </mesh>
          {/* halo */}
          <mesh ref={(m) => m && (slot(o).halo = m)}>
            <sphereGeometry args={[0.95, 24, 24]} />
            <meshBasicMaterial
              color="#ffcf7a"
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* warm light cast on the wheat below */}
          <pointLight
            ref={(l) => l && (slot(o).light = l)}
            color="#ffd592"
            intensity={4}
            distance={22}
            decay={1.6}
          />
          {/* downward carving beam (unit height cone, scaled per frame) */}
          <mesh
            ref={(m) => m && (slot(o).beam = m)}
            position={[0, -0.5, 0]}
          >
            <coneGeometry args={[radius * 1.5, 1, 28, 1, true]} />
            <meshBasicMaterial
              color="#ffdf9e"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
