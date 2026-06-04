import { useStore } from "../store";
import { SYMMETRY_VALUES, type PatternType } from "../patterns";

const TYPES: { id: PatternType; label: string }[] = [
  { id: "rings", label: "Rings" },
  { id: "spiral", label: "Spiral" },
  { id: "radial", label: "Radial" },
  { id: "mandala", label: "Mandala" },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <div className="lab-control">
      <div className="lab-label">
        <span>{label}</span>
        <span className="lab-value">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

// Procedural controls for the custom formation. Edits are stored; the shared
// "Reform Field" button rebuilds and animates the pattern.
export default function FormationLab() {
  const s = useStore((st) => st.customSettings);
  const update = useStore((st) => st.updateCustom);

  const complexityLabel =
    s.patternType === "spiral"
      ? "Complexity · turns"
      : s.patternType === "rings"
      ? "Complexity · rings"
      : s.patternType === "radial"
      ? "Complexity · cross-rings"
      : "Complexity · layers";

  return (
    <div className="lab">
      <div className="lab-title">Formation Lab</div>

      <div className="lab-control">
        <div className="lab-label">
          <span>Pattern</span>
        </div>
        <div className="lab-seg">
          {TYPES.map((t) => (
            <button
              key={t.id}
              className={"lab-seg-btn" + (s.patternType === t.id ? " active" : "")}
              onClick={() => update({ patternType: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Slider label="Radius" value={s.radius} min={6} max={22} step={0.5} onChange={(v) => update({ radius: v })} />
      <Slider
        label="Line Width"
        value={s.lineWidth}
        min={0.6}
        max={3}
        step={0.1}
        onChange={(v) => update({ lineWidth: v })}
      />
      <Slider
        label={complexityLabel}
        value={s.complexity}
        min={1}
        max={8}
        step={1}
        onChange={(v) => update({ complexity: v })}
      />

      <div className="lab-control">
        <div className="lab-label">
          <span>Symmetry</span>
          <span className="lab-value">{s.symmetry}</span>
        </div>
        <div className="lab-seg">
          {SYMMETRY_VALUES.map((v) => (
            <button
              key={v}
              className={"lab-seg-btn" + (s.symmetry === v ? " active" : "")}
              onClick={() => update({ symmetry: v })}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Rotation"
        value={s.rotation}
        min={0}
        max={Math.PI * 2}
        step={0.05}
        onChange={(v) => update({ rotation: v })}
        fmt={(v) => Math.round((v / Math.PI) * 180) + "°"}
      />
      <Slider
        label="Organic Noise"
        value={s.noise}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => update({ noise: v })}
        fmt={(v) => v.toFixed(2)}
      />
      <Slider label="Orbs" value={s.orbCount} min={1} max={4} step={1} onChange={(v) => update({ orbCount: v })} />
    </div>
  );
}
