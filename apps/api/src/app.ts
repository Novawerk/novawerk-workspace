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

import { eventRoutes } from "./analytics/ingest.js";
import { createGoogleVerifier } from "./auth.js";
import { notFound } from "./http.js";
import { adminRoutes } from "./routes/admin.js";
import { intakeChatRoutes } from "./intake-chat/routes.js";
import { authRoutes } from "./routes/auth.js";
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
  const adminCors = cors({
    origin: deps.env.adminOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  });

  const app = factory
    .createApp()
    .use("/health", publicCors)
    .use("/public/*", publicCors)
    .use("/auth/*", adminCors)
    .use("/admin/*", adminCors)
    .get("/health", (c) => c.json({ ok: true as const }, 200))
    .route("/public", publicRoutes({ ...deps, logger }))
    .route("/public/intake", intakeChatRoutes({ ...deps, logger }))
    .route("/public/events", eventRoutes(deps))
    .route("/auth", authRoutes({ ...deps, logger, verifyGoogleToken }))
    .route("/admin", adminRoutes({ ...deps, logger }))
    .route("/cron", cronRoutes(deps))
    .route("/exports", postExportRoutes(deps))
    .route("/webhooks", webhookRoutes({ ...deps, logger }));

  app.notFound((c) => c.json(notFound, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message || "Bad request" }, err.status);
    logger.error("[api] unhandled error:", err);
    return c.json({ error: "Something went wrong on our side" }, 500);
  });

  return app;
}

/** For `hono/client`: `hc<AppType>(apiUrl)` in apps/web and apps/admin. */
export type AppType = ReturnType<typeof createApp>;
