import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://p0ny0-89.github.io/cropfall/ on GitHub Pages, so the
// production build needs that base path. Local dev stays at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/cropfall/" : "/",
  plugins: [react()],
}));
