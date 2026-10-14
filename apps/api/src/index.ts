// Production entry: tsup bundles this file into dist/index.js, and api/index.js serves that
// bundle as the Vercel Function (see vercel.json). Locally, src/server.ts runs the same app.

import type { Hono } from "hono";

import { createApp } from "./app.js";
import { depsFromEnv } from "./deps.js";
import type { ApiEnv } from "./types.js";

const app: Hono<ApiEnv> = createApp(depsFromEnv(process.env));

export default app;
