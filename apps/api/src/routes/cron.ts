// Scheduled jobs, called by Vercel Cron (apps/api/vercel.json "crons"). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the routes don't exist.

import { timingSafeEqual } from "node:crypto";

import { Hono } from "hono";

import { deleteExpiredAnalyticsEvents } from "../analytics/cleanup.js";
import { syncWithGitHub } from "../github.js";
import { runChatNotices } from "../chat-notices.js";
import { runContributorNotices } from "../contributor-notices.js";
import { notFound } from "../http.js";
import { deleteExpiredIntakeSessions } from "../intake-chat/cleanup.js";
import { deleteUnconfirmed } from "../newsletter.js";
import { deleteUnsentResumes } from "../resume-cleanup.js";
import { deleteUnsentScreenshots, finishTriagedScreenshots } from "../screenshot-cleanup.js";
import { deleteOldCodes } from "../sign-in-codes.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronRoutes(deps: AppDeps & { logger: Logger }) {
  const { db, env, files, sendContributorNotice, postToChat, logger } = deps;
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
    .get("/screenshot-cleanup", async (c) =>
      c.json(
        {
          deleted: await deleteUnsentScreenshots(db, files, new Date(), deps.logger),
          triage: await finishTriagedScreenshots(db, files, deps.logger),
        },
        200,
      ),
    )
    .get("/sign-in-cleanup", async (c) => c.json({ deleted: await deleteOldCodes(db) }, 200))
    // Nightly: catch up on pull requests GitHub didn't deliver, remind and release idle tasks.
    .get("/github-sync", async (c) => c.json(await syncWithGitHub(deps), 200))
    // Every 10 minutes from GitHub Actions (.github/workflows/contributor-notices.yml), daily from
    // Vercel as a fallback: the queue, then the mail (NB-ADR-0013).
    .get("/contributor-notices", async (c) =>
      c.json(
        await runContributorNotices(db, sendContributorNotice, logger, {
          unsubscribe: { apiUrl: env.publicUrls.apiUrl, secret: env.sessionSecret },
        }),
        200,
      ),
    )
    // Next to the contributor notices (same workflow, same fallback): task board news for the
    // team's chat room. Without CHAT_BOT_URL it answers { configured: false }.
    .get("/chat-notices", async (c) =>
      c.json(
        await runChatNotices(
          db,
          postToChat,
          { webUrl: env.publicUrls.webUrl, adminUrl: env.adminOrigins.find((o) => o.startsWith("https://")) ?? env.adminOrigins[0] ?? "https://admin.novawerk.io" },
          logger,
        ),
        200,
      ),
    )
    // Daily: unconfirmed newsletter addresses go (privacy notice). Logs what it deleted.
    .get("/newsletter-cleanup", async (c) => {
      const deleted = await deleteUnconfirmed(db);
      if (deleted.expired || deleted.beforeDoubleOptIn) {
        logger.warn(
          `[newsletter-cleanup] deleted ${deleted.beforeDoubleOptIn} unconfirmed from before double opt-in, ${deleted.expired} expired signups`,
        );
      }
      return c.json(deleted, 200);
    });
}
