import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each file boots an in-memory Postgres (PGlite); see @nw/db/testing for the timeout.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
