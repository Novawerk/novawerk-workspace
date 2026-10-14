// The Vercel Function. vercel.json rewrites every path here, and the app comes from our own
// bundle (`pnpm build` → dist/, tsup), so Vercel runs plain JavaScript instead of compiling
// the TypeScript itself (its compiler settings differ from ours and fail the build).
import { handle } from "hono/vercel";

import app from "../dist/index.js";

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
