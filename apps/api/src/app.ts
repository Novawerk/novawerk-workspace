// @nw/api — the only entry to Postgres from the internet.
// `createApp(deps)` takes everything from outside (db, config, notifier) so tests can pass a
// PGlite db and a fake notifier. Env is read only in src/index.ts (production) and
// src/server.ts (local).
//
// next:
// - pagination on the admin lists; rate limiting on the public POSTs

import { cors } from "hono/cors";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { TaskRuleError } from "@nw/tasks";

import { eventRoutes } from "./analytics/ingest.js";
import { createGoogleVerifier } from "./auth.js";
import { notFound } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { intakeChatRoutes } from "./intake-chat/routes.js";
import { authRoutes } from "./routes/auth.js";
import { boardRoutes } from "./routes/board.js";
import { contribRoutes } from "./routes/contrib.js";
import { mcpRoutes } from "./mcp.js";
import { TokenGate } from "./token-gate.js";
import { cronRoutes } from "./routes/cron.js";
import { postExportRoutes } from "./routes/admin/post-exports.js";
import { publicRoutes } from "./routes/public.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { ApiEnv, AppDeps } from "./types.js";

export type {
  AdminChatDeps,
  AdminChatOptions,
  AdminMember,
  ApiConfig,
  AppDeps,
  GoogleIdentity,
  GoogleVerifier,
  InboundMailOptions,
  IntakeChatDeps,
  IntakeChatOptions,
  Notifier,
} from "./types.js";

const factory = createFactory<ApiEnv>();

/** The Postgres error code, from node-postgres or PGlite (Drizzle wraps it in `cause`). */
function pgCodeOf(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

export function createApp(deps: AppDeps) {
  const logger = deps.logger ?? console;
  const verifyGoogleToken = deps.verifyGoogleToken ?? createGoogleVerifier(deps.env.googleClientId);

  const publicCors = cors({
    origin: deps.env.allowedOrigins,
    // PATCH: the Intake Agent panel saves the visitor's edits (/public/intake/sessions/:id/draft).
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86_400,
  });
  const credentialed = (origins: string[]) =>
    cors({
      origin: origins,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    });
  const adminCors = credentialed(deps.env.adminOrigins);
  // The website. /contrib never answers the admin panel's origins, nor /admin the website's.
  const contributorOrigins = deps.env.contributorOrigins ?? deps.env.allowedOrigins.filter((o) => !deps.env.adminOrigins.includes(o));
  const contributorCors = credentialed(contributorOrigins);
  // One sign-in for both (NB-ADR-0014).
  const authCors = credentialed([...contributorOrigins, ...deps.env.adminOrigins]);
  const auth = authRoutes({ ...deps, logger, verifyGoogleToken });

  const tokens = new TokenGate(deps.db, deps.env.webReadKey);

  const app = factory
    .createApp()
    .use("/health", publicCors)
    .use("/public/*", publicCors)
    .use("/auth/*", authCors)
    .use("/contrib/*", contributorCors)
    .use("/admin/*", adminCors)
    .get("/health", (c) => c.json({ ok: true as const }, 200))
    .route("/public", publicRoutes({ ...deps, logger }))
    .route("/public/intake", intakeChatRoutes({ ...deps, logger }))
    .route("/public/events", eventRoutes(deps))
    .route("/public", boardRoutes(deps, tokens))
    // The old paths: the GitHub App's callback, and the website until it moves to /auth.
    .route("/auth/contributor", auth)
    .route("/auth", auth)
    .route("/contrib", contribRoutes(deps, tokens, contributorOrigins))
    .route("/mcp", mcpRoutes({ ...deps, logger }, tokens))
    .route("/admin", adminRoutes({ ...deps, logger }))
    .route("/cron", cronRoutes({ ...deps, logger }))
    .route("/exports", postExportRoutes(deps))
    .route("/webhooks", webhookRoutes({ ...deps, logger }));

  app.notFound((c) => c.json(notFound, 404));
  app.onError((err, c) => {
    // A task board rule said no (@nw/tasks): its own status, and the field when there is one.
    if (err instanceof TaskRuleError) {
      return c.json(err.field ? { error: err.message, issues: { [err.field]: [err.message] } } : { error: err.message }, err.httpStatus);
    }
    if (err instanceof HTTPException) return c.json({ error: err.message || "Bad request" }, err.status);
    // Postgres gave up on one of two transactions waiting on each other (deadlock 40P01,
    // serialization 40001). Nothing was written; the request can simply run again.
    if (pgCodeOf(err) === "40P01" || pgCodeOf(err) === "40001") {
      return c.json({ error: "Someone else changed this at the same moment. Try again." }, 409);
    }
    logger.error("[api] unhandled error:", err);
    return c.json({ error: "Something went wrong on our side" }, 500);
  });

  return app;
}

/** For `hono/client`: `hc<AppType>(apiUrl)` in apps/web and apps/admin. */
export type AppType = ReturnType<typeof createApp>;
