import { defineConfig } from "vitest/config";

// Rendering a card (satori + resvg, both WebAssembly) takes well under a second locally, but
// 1–5 s on a busy GitHub runner, and the first one also starts the WebAssembly. Past the 5 s default.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
