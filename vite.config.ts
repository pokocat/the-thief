import { defineConfig } from "vite";

// Heist TD — Babylon.js + TypeScript prototype.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "es2020", outDir: "dist" },
});
