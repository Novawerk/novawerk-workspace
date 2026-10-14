// The newsletter list, with double opt-in (privacy notice: "When you sign up for the newsletter").
//
// - Signing up makes a pending row and emails a link; only clicking it confirms. Issues go to
//   confirmed rows that haven't unsubscribed (`isConfirmedSubscriber` in @nw/db).
// - Only a SHA-256 of the confirmation token is stored. A link lives 72 hours.
// - At most 3 confirmation emails per address per 24 hours, so the form can't flood a stranger.
// - Signing up says the same thing whether the address is new, pending or confirmed.
// - Unsubscribing keeps only the marker: `subscribed` false, no confirmation, no live token.
//   Signing up again after that stays unsubscribed until the new link is clicked.

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import { NEWSLETTER_CONFIRM_TTL_HOURS } from "@nw/contracts";
import { newsletterSubscribers, type Database } from "@nw/db";

export const CONFIRM_TTL_MS = NEWSLETTER_CONFIRM_TTL_HOURS * 3_600_000;
export const MAX_CONFIRMATIONS_PER_WINDOW = 3;
export const CONFIRM_WINDOW_MS = 24 * 3_600_000;

const normalise = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Records a signup. Returns a new confirmation token to email, or null when nothing should go
 * out: the address is already confirmed, or it asked too often.
 */
export async function requestSubscription(
  db: Database,
  email: string,
  source = "website",
  now = new Date(),
): Promise<string | null> {
  const address = normalise(email);
  return db.transaction(async (tx) => {
    await tx.insert(newsletterSubscribers).values({ email: address, source, createdAt: now }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, address))
      .for("update");
    if (!row || (row.subscribed && row.confirmedAt)) return null;

    const windowStart = row.confirmWindowStartedAt;
    const windowOpen = windowStart !== null && now.getTime() - windowStart.getTime() < CONFIRM_WINDOW_MS;
    const sent = windowOpen ? row.confirmSendCount : 0;
    if (sent >= MAX_CONFIRMATIONS_PER_WINDOW) return null;

    const token = randomBytes(32).toString("base64url");
    await tx
      .update(newsletterSubscribers)
      .set({
        confirmTokenHash: hashToken(token),
        confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
        confirmWindowStartedAt: windowOpen ? windowStart : now,
        confirmSendCount: sent + 1,
      })
      .where(eq(newsletterSubscribers.id, row.id));
    return token;
  });
}

/**
 * Confirms the address whose latest link holds this token. True when it is (or already was)
 * confirmed; false for an unknown, replaced or expired link.
 */
export async function confirmSubscription(db: Database, token: string, now = new Date()): Promise<boolean> {
  const confirmed = await db
    .update(newsletterSubscribers)
    .set({ subscribed: true, confirmedAt: sql`coalesce(${newsletterSubscribers.confirmedAt}, ${now.toISOString()}::timestamptz)` })
    .where(
      and(
        eq(newsletterSubscribers.confirmTokenHash, hashToken(token)),
        gt(newsletterSubscribers.confirmTokenExpiresAt, now),
      ),
    )
    .returning({ id: newsletterSubscribers.id });
  return confirmed.length === 1;
}

/** Unsubscribes the holder of this token. Idempotent; an unknown token changes nothing. */
export async function unsubscribe(db: Database, unsubscribeToken: string): Promise<void> {
  await db
    .update(newsletterSubscribers)
    .set({ subscribed: false, confirmedAt: null, confirmTokenHash: null, confirmTokenExpiresAt: null })
    .where(eq(newsletterSubscribers.unsubscribeToken, unsubscribeToken.toLowerCase()));
}
