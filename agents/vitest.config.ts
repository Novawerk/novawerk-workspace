import { defineConfig } from "vitest/config";

// Loading an agent pulls in most of the packages, and a dry run migrates a fresh in-memory
// Postgres (PGlite). About a second each locally, 5–7 s on a GitHub runner, past the 5 s default.
export default defineConfig({
  test: { testTimeout: 30_000 },
});
