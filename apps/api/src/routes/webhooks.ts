// Webhooks from other services (GitHub, Resend). Each one checks its own signature; none uses
// CORS or cookies.
// Without its config a webhook answers 404, like /cron.

import { Hono } from "hono";
import { ZodError } from "zod";

import { parseWebhook, verifyWebhookSignature } from "@nw/github";
import { claimDelivery, forgetDelivery } from "@nw/tasks";

import { handlePullRequest } from "../github.js";
import { notFound } from "../http.js";
import { relayToSlack, verifyResendSignature, webhookEventSchema } from "../inbound-mail.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

/** GitHub delivery ids are GUIDs. */
const DELIVERY_ID = /^[0-9a-f-]{8,64}$/i;

export function webhookRoutes(deps: AppDeps & { logger: Logger }) {
  const { inboundMail, logger, env, db } = deps;
  return new Hono<ApiEnv>()
    // GitHub (the App `novawerk-task-board`): pull requests move tasks (src/github.ts). Signed
    // with GITHUB_WEBHOOK_SECRET; each delivery id is handled once. 5xx only when a retry can help.
    .post("/github", async (c) => {
      const secret = env.githubWebhookSecret;
      if (!secret) return c.json(notFound, 404);
      const body = await c.req.text();
      if (!verifyWebhookSignature(secret, body, c.req.header("x-hub-signature-256"))) {
        return c.json({ error: "Not allowed" }, 401);
      }
      const delivery = c.req.header("x-github-delivery") ?? "";
      const event = c.req.header("x-github-event") ?? "";
      if (!DELIVERY_ID.test(delivery)) return c.json({ error: "Bad request" }, 400);

      let parsed: ReturnType<typeof parseWebhook>;
      try {
        parsed = parseWebhook(event, JSON.parse(body));
      } catch (err) {
        if (err instanceof SyntaxError || err instanceof ZodError) return c.json({ error: "Bad request" }, 400);
        throw err;
      }
      if (parsed.kind !== "pull_request") return c.json({ ignored: parsed.kind === "ping" ? "ping" : parsed.reason }, 200);
      if (!(await claimDelivery(db, delivery, event))) return c.json({ duplicate: true }, 200);

      try {
        const outcome = await handlePullRequest(deps, parsed.pr, { source: "webhook", action: parsed.action });
        return c.json({ result: outcome.result, task: outcome.taskNumber }, 200);
      } catch (err) {
        // Let GitHub's redelivery try again.
        await forgetDelivery(db, delivery);
        logger.error(`[github] delivery ${delivery} failed:`, err instanceof Error ? err.message : err);
        return c.json({ error: "Something went wrong on our side" }, 500);
      }
    })

    // Resend: an email reached the info@ group. Answer 5xx only when a retry can help.
    .post("/resend", async (c) => {
      if (!inboundMail) return c.json(notFound, 404);
      const body = await c.req.text();
      const signed = verifyResendSignature(
        inboundMail.webhookSecret,
        { id: c.req.header("svix-id"), timestamp: c.req.header("svix-timestamp"), signature: c.req.header("svix-signature") },
        body,
      );
      if (!signed) return c.json({ error: "Not allowed" }, 401);

      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return c.json({ error: "Bad request" }, 400);
      }
      const event = webhookEventSchema.safeParse(json);
      if (!event.success) return c.json({ error: "Bad request" }, 400);
      if (event.data.type !== "email.received") return c.json({ ignored: event.data.type }, 200);
      const emailId = event.data.data?.email_id;
      if (!emailId) return c.json({ error: "Bad request" }, 400);

      // Log ids and outcomes only: the email itself is personal data.
      try {
        const result = await relayToSlack(emailId, inboundMail);
        if (result === "not-from-list") {
          logger.warn(`[api] inbound email ${emailId} skipped: no List-ID <${inboundMail.listId}>`);
        }
        return c.json({ result }, 200);
      } catch (err) {
        logger.error(`[api] inbound email ${emailId} not posted to Slack:`, err instanceof Error ? err.message : err);
        return c.json({ error: "Could not post to Slack" }, 502);
      }
    });
}
