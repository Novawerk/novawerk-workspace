import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only needed for migrate/studio; generate works offline. Unset in the shell,
// it comes from apps/api/.env, as for the local API.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(new URL("../../apps/api/.env", import.meta.url));
  } catch {
    // No apps/api/.env: migrate says the URL is missing.
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
