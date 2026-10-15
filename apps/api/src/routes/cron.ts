// Scheduled jobs, called by Vercel Cron (apps/api/vercel.json "crons"). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the routes don't exist.

import { timingSafeEqual } from "node:crypto";

import { Hono } from "hono";

import { deleteExpiredAnalyticsEvents } from "../analytics/cleanup.js";
import { syncWithGitHub } from "../github.js";
import { notFound } from "../http.js";
import { deleteExpiredIntakeSessions } from "../intake-chat/cleanup.js";
import { deleteUnsentResumes } from "../resume-cleanup.js";
import { deleteOldCodes } from "../sign-in-codes.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronRoutes(deps: AppDeps & { logger: Logger }) {
  const { db, env, files } = deps;
  return new Hono<ApiEnv>()
    .use("*", async (c, next) => {
      if (!env.cronSecret) return c.json(notFound, 404);
      if (!sameSecret(c.req.header("authorization") ?? "", `Bearer ${env.cronSecret}`)) {
        return c.json({ error: "Not allowed" }, 401);
      }
      await next();
    })
    .get("/intake-cleanup", async (c) => c.json({ deleted: await deleteExpiredIntakeSessions(db) }, 200))
    .get("/analytics-cleanup", async (c) => c.json({ deleted: await deleteExpiredAnalyticsEvents(db) }, 200))
    .get("/resume-cleanup", async (c) => c.json({ deleted: await deleteUnsentResumes(db, files) }, 200))
    .get("/sign-in-cleanup", async (c) => c.json({ deleted: await deleteOldCodes(db) }, 200))
    // Nightly: catch up on pull requests GitHub didn't deliver, remind and release idle tasks.
    .get("/github-sync", async (c) => c.json(await syncWithGitHub(deps), 200));
}
