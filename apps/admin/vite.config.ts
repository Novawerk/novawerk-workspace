import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

// Vite+ config: standard Vite options for `vp dev` / `vp build`, plus the `lint` block for `vp lint`.
export default defineConfig({
  plugins: [
    // Must run before the React plugin. Generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  lint: {
    ignorePatterns: ["dist/**", "src/routeTree.gen.ts"],
  },
})
