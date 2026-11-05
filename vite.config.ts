import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Tauri expects a fixed dev port and serves the built files from dist/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  build: { target: "es2020", outDir: "dist" },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) }, // one version, read from package.json
  test: { setupFiles: ["./src/tests/setup.ts"], testTimeout: 20000, hookTimeout: 20000 },
});
