import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only needed for migrate/studio; generate works offline.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
