// Local Node server: `pnpm --filter @nw/api dev` (tsx watch) or `pnpm start` after a build.
// Reads apps/api/.env if present; variables already set in the shell win.

import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { LOCAL_PRIVATE_DIR, LocalFiles } from "@nw/object-store/local";

import { createApp } from "./app.js";
import { LOCAL_FILES_ROOT, depsFromEnv } from "./deps.js";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — rely on the shell environment.
}

const port = Number(process.env.PORT ?? 8787);
const deps = depsFromEnv(process.env);
const app = createApp(deps);

// Local development: the pictures of repo posts synced with `pnpm post sync --local`, and without
// a BLOB_* token every upload, live in .local-files/ at the repo root. Only with DEV_LOGIN, never
// on Vercel. The private files in .local-files/_private/ are not served here.
const LOCAL_FILES = fileURLToPath(LOCAL_FILES_ROOT);
const PRIVATE = resolve(LOCAL_FILES, LOCAL_PRIVATE_DIR) + sep;
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif" };

async function localFile(pathname: string): Promise<Response> {
  const file = resolve(LOCAL_FILES, decodeURIComponent(pathname.slice("/dev/files/".length)));
  const type = TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(LOCAL_FILES.replace(/[\\/]$/, "") + sep) || file.startsWith(PRIVATE) || !type) return new Response("Not found", { status: 404 });
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
const uploads = deps.files instanceof LocalFiles ? deps.files : undefined;
const fetch: typeof app.fetch = (req, ...rest) => {
  const { pathname } = new URL(req.url);
  if (devFiles && pathname.startsWith("/dev/files/")) return localFile(pathname);
  if (uploads && pathname.startsWith("/dev/uploads/")) return uploads.receive(req);
  return app.fetch(req, ...rest);
};

serve({ fetch, port }, (info) => {
  console.log(`@nw/api listening on http://localhost:${info.port}`);
  if (uploads) console.log(`Uploads go to ${LOCAL_FILES} (no BLOB_* token set)`);
});
