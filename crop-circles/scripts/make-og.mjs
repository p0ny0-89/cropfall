// Generates public/og-image.png — the social share card (1200x630).
// Designed card (not a 3D screenshot) so it reads cleanly at thumbnail size in
// Reddit/IG/Discord/iMessage previews. Night palette + crop-circle motif + mono
// wordmark. Run: node scripts/make-og.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const W = 1200;
const H = 630;
const cx = 600;

// deterministic little PRNG so the starfield is reproducible
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// scattered stars across the upper sky
let stars = "";
for (let i = 0; i < 90; i++) {
  const x = rnd() * W;
  const y = rnd() * (H * 0.62);
  const r = 0.5 + rnd() * 1.6;
  const o = 0.2 + rnd() * 0.6;
  stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#eaf0ff" opacity="${o.toFixed(2)}"/>`;
}

// crop-circle formation, centred low
const fx = cx;
const fy = 452;
let formation = "";
for (const r of [158, 118, 76]) {
  formation += `<circle cx="${fx}" cy="${fy}" r="${r}" fill="none" stroke="#9aa6dc" stroke-width="2" opacity="0.45"/>`;
}
// radial spokes
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const x1 = fx + Math.cos(a) * 76;
  const y1 = fy + Math.sin(a) * 76;
  const x2 = fx + Math.cos(a) * 158;
  const y2 = fy + Math.sin(a) * 158;
  formation += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#9aa6dc" stroke-width="1.6" opacity="0.32"/>`;
}
// satellite dots on the outer ring
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.26;
  const x = fx + Math.cos(a) * 158;
  const y = fy + Math.sin(a) * 158;
  formation += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#b9ccff" opacity="0.8"/>`;
}
// glowing core + a couple of carving orbs
const orb = (x, y, r, o = 1) =>
  `<circle cx="${x}" cy="${y}" r="${r * 3.2}" fill="#b9ccff" opacity="${0.18 * o}"/>` +
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#eef3ff" opacity="${o}"/>`;
formation += orb(fx, fy, 9);
formation += orb(fx + 118, fy - 8, 6, 0.95);
formation += orb(fx - 96, fy + 64, 5, 0.9);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#231a52"/>
      <stop offset="0.5" stop-color="#33296f"/>
      <stop offset="1" stop-color="#3a4690"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.72" r="0.6">
      <stop offset="0" stop-color="#5566b8" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#5566b8" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${stars}
  ${formation}

  <text x="${cx}" y="232" text-anchor="middle" font-family="JetBrains Mono" font-weight="700"
        font-size="116" letter-spacing="6" fill="#eef3ff">CROPFALL</text>
  <text x="${cx}" y="290" text-anchor="middle" font-family="JetBrains Mono" font-weight="400"
        font-size="25" letter-spacing="7" fill="#aebfff">INTERACTIVE CROP-CIRCLE FIELD</text>

  <text x="${cx}" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="400"
        font-size="20" letter-spacing="2" fill="#8c9ce0">p0ny0-89.github.io/ClaudeCode</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  background: "#231a52",
  font: {
    fontFiles: [join(here, "fonts/JBM-Regular.ttf"), join(here, "fonts/JBM-Bold.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
});
const png = resvg.render().asPng();
const out = join(here, "..", "public", "og-image.png");
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
