// /admin/subscribers: the newsletter list from novawerk.io/about, and a CSV of who is confirmed.
// Tokens never leave the API: the list carries a status, not the row.

import { desc } from "drizzle-orm";
import { Hono } from "hono";

import type { SubscriberStatus } from "@nw/contracts";
import { isConfirmedSubscriber, newsletterSubscribers, type NewsletterSubscriber } from "@nw/db";

import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

/** One CSV cell. Quotes when needed, and defuses spreadsheet formulas (=, +, -, @). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function subscriberStatus(row: Pick<NewsletterSubscriber, "subscribed" | "confirmedAt">): SubscriberStatus {
  if (!row.subscribed) return "unsubscribed";
  return row.confirmedAt ? "confirmed" : "pending";
}

export function subscriberRoutes({ db }: AdminDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const rows = await db
        .select({
          id: newsletterSubscribers.id,
          email: newsletterSubscribers.email,
          subscribed: newsletterSubscribers.subscribed,
          source: newsletterSubscribers.source,
          confirmedAt: newsletterSubscribers.confirmedAt,
          createdAt: newsletterSubscribers.createdAt,
        })
        .from(newsletterSubscribers)
        .orderBy(desc(newsletterSubscribers.createdAt));
      return c.json(
        rows.map(({ subscribed, ...row }) => ({ ...row, status: subscriberStatus({ subscribed, confirmedAt: row.confirmedAt }) })),
        200,
      );
    })

    /** Only confirmed people who haven't unsubscribed: this is the list you send to. */
    .get("/export", async (c) => {
      const rows = await db
        .select({ email: newsletterSubscribers.email, source: newsletterSubscribers.source, confirmedAt: newsletterSubscribers.confirmedAt })
        .from(newsletterSubscribers)
        .where(isConfirmedSubscriber)
        .orderBy(newsletterSubscribers.confirmedAt);
      const lines = [
        "email,source,confirmed_at",
        ...rows.map((r) => [r.email, r.source, r.confirmedAt!.toISOString()].map(csvCell).join(",")),
      ];
      const day = new Date().toISOString().slice(0, 10);
      return c.body(`${lines.join("\r\n")}\r\n`, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="novawerk-subscribers-${day}.csv"`,
        "Cache-Control": "no-store",
      });
    });
}
