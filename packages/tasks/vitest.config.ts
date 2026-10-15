import { defineConfig } from "vitest/config";

// Each test file boots an in-memory Postgres (PGlite) once; see @nw/db/testing for the timeout.
export default defineConfig({
  test: { testTimeout: 20_000, hookTimeout: 60_000 },
});
