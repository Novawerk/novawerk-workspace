// The daily newsletter cleanup: unconfirmed addresses go, with no marker (privacy notice).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newsletterSubscribers, type Database } from "@nw/db";

import { deleteUnconfirmed } from "../src/newsletter.js";
import { createTestDb, makeApp, resetDb } from "./helpers.js";

const DAY = 86_400_000;
const CRON_SECRET = "cron-secret-0123456789";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
});

const left = async () => (await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers)).map((r) => r.email).sort();

describe("deleteUnconfirmed", () => {
  it("deletes unconfirmed rows from before double opt-in, and signups whose link expired 30 days on", async () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    const beforeOptIn = new Date("2026-03-01T10:00:00Z");
    await db.insert(newsletterSubscribers).values([
      // Before double opt-in: never sent a confirmation email, gone. Also the morning #48 went live.
      { email: "old-never-asked@example.org", createdAt: beforeOptIn },
      { email: "same-morning@example.org", createdAt: new Date("2026-10-14T03:00:00Z") },
      // …unless they signed up again since and their link is still live.
      { email: "old-live-link@example.org", createdAt: beforeOptIn, confirmSendCount: 1, confirmTokenExpiresAt: ago(-1) },
      // Old and confirmed, or unsubscribed: stays.
      { email: "old-confirmed@example.org", createdAt: beforeOptIn, confirmedAt: new Date("2026-10-20") },
      { email: "old-unsubscribed@example.org", createdAt: beforeOptIn, subscribed: false },
      // Since double opt-in: gone once the link expired and it's 30 days old.
      { email: "expired-old@example.org", createdAt: ago(40), confirmSendCount: 1, confirmTokenExpiresAt: ago(37) },
      { email: "expired-young@example.org", createdAt: ago(10), confirmSendCount: 1, confirmTokenExpiresAt: ago(7) },
      { email: "live@example.org", createdAt: ago(1), confirmSendCount: 1, confirmTokenExpiresAt: ago(-2) },
    ]);
    expect(await deleteUnconfirmed(db, now)).toEqual({ beforeDoubleOptIn: 2, expired: 1 });
    expect(await left()).toEqual(
      ["expired-young@example.org", "live@example.org", "old-confirmed@example.org", "old-live-link@example.org", "old-unsubscribed@example.org"].sort(),
    );
    // Idempotent.
    expect(await deleteUnconfirmed(db, now)).toEqual({ beforeDoubleOptIn: 0, expired: 0 });
  });

  it("runs on GET /cron/newsletter-cleanup and logs what it deleted", async () => {
    await db.insert(newsletterSubscribers).values({ email: "old@example.org", createdAt: new Date("2026-03-01") });
    const { app, logger } = makeApp(db, { env: { cronSecret: CRON_SECRET } });
    const res = await app.request("/cron/newsletter-cleanup", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(await res.json()).toEqual({ beforeDoubleOptIn: 1, expired: 0 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("deleted 1 unconfirmed from before double opt-in"));
    expect(await left()).toEqual([]);
  });
});
