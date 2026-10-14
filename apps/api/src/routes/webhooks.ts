// Webhooks from other services. Each one checks its own signature; none uses CORS or cookies.
// Without its config a webhook answers 404, like /cron.

import { Hono } from "hono";

import { notFound } from "../http.js";
import { relayToSlack, verifyResendSignature, webhookEventSchema } from "../inbound-mail.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

export function webhookRoutes({ inboundMail, logger }: AppDeps & { logger: Logger }) {
  // Resend: an email reached the info@ group. Answer 5xx only when a retry can help.
  return new Hono<ApiEnv>().post("/resend", async (c) => {
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
