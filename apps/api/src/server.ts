// Local Node server: `pnpm --filter @nw/api dev` (tsx watch) or `pnpm start` after a build.
// Reads apps/api/.env if present; variables already set in the shell win.

import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { depsFromEnv } from "./deps.js";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — rely on the shell environment.
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp(depsFromEnv(process.env));

// Local development: the pictures of repo posts synced with `pnpm post sync --local` live in
// .local-files/ at the repo root (no Blob store needed). Only with DEV_LOGIN, never on Vercel.
const LOCAL_FILES = fileURLToPath(new URL("../../../.local-files/", import.meta.url));
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif" };

async function localFile(pathname: string): Promise<Response> {
  const file = resolve(LOCAL_FILES, decodeURIComponent(pathname.slice("/dev/files/".length)));
  const type = TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(LOCAL_FILES.replace(/[\\/]$/, "") + sep) || !type) return new Response("Not found", { status: 404 });
  try {
    // Any origin: the admin panel (another port) downloads these.
    return new Response(await readFile(file), {
      headers: { "Content-Type": type, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const devFiles = process.env.DEV_LOGIN === "true";
const fetch: typeof app.fetch = (req, ...rest) => {
  const { pathname } = new URL(req.url);
  return devFiles && pathname.startsWith("/dev/files/") ? localFile(pathname) : app.fetch(req, ...rest);
};

serve({ fetch, port }, (info) => {
  console.log(`@nw/api listening on http://localhost:${info.port}`);
});
