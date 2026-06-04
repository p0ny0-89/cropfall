# Cropfall — Crop Circle Formations

An interactive 3D web experience: bright flying orbs trace beams of light across a
golden wheat field, physically flattening the crop stalks into readable crop-circle
formations. Once a formation completes, you explore it from the air or drop down to
ground level.

Built with **React + Three.js (React Three Fiber)**, with **Framer Motion** for the UI
and **Zustand** for state.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

## How it works

The whole experience is driven by **strokes** — polylines in the ground plane that the
orbs literally fly along (`src/patterns.ts`). Because the same strokes are used to:

1. **route the orbs** (`src/Orbs.tsx`), and
2. **decide which stalks flatten and exactly when** (`computeCarve`),

the formation reads as if the orbs are carving it in real time.

### Scene states (`src/Scene.tsx`)

| State        | What happens |
|--------------|--------------|
| `intro`      | Untouched field, orbs waiting to descend. |
| `forming`    | `formProgress` ramps 0→1; orbs trace strokes, beams glow, stalks tip over. |
| `explore`    | Camera responds to the cursor — up for aerial, down for ground level. |
| pattern swap | Selecting a formation (or *Reform Field*) resets and replays the carve. |

### Key pieces

- **`src/CropField.tsx`** — ~13k instanced cross-blades. A `MeshStandardMaterial` is
  patched via `onBeforeCompile` so the GPU handles per-blade **wind sway** and the
  **physical flatten** (each stalk tips along its brushed direction once the orb's
  carve-time passes). Flattened straw lies down, lightens, and catches overhead light.
- **`src/Ground.tsx`** — bakes two canvas textures per pattern (a flatten *mask* and a
  carve-*time* map) so the soil reveals a clean, top-down-legible swirl as the orbs pass.
- **`src/Orbs.tsx`** — four orbs with halos, warm point lights, and downward carving
  beams that only fire while actively tracing a stroke.

### Patterns

Classic Rings · Spiral · Mandala · Radial · Glyph — defined declaratively as stroke
sets in `src/patterns.ts`. Add a new one by writing a builder that returns strokes.
