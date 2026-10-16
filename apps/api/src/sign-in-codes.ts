// Signing in by email (src/routes/auth.ts): we email a 6-digit code; typing it back gives the
// same session as GitHub or Google, and creates the account on first use (NB-ADR-0014). Codes
// from the two-account days (`kind: "contributor"`) never work: every code now is `member`.
//
// - Only a keyed hash of the code is stored (HMAC with the session secret).
// - A code lives 10 minutes, allows 5 tries (each claimed atomically before the comparison), and
//   works once. The verify routes also limit tries per IP.
// - At most 3 codes per address per 15 minutes.
// - Asking for a code says the same thing whether or not the address has an account, so the form
//   can't be used to find out who has one.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { signInCodes, type Database } from "@nw/db";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_WINDOW = 3;
export const WINDOW_MS = 15 * 60_000;
/** Code checks per client IP per hour on the verify routes (in-memory, per instance). */
export const VERIFY_TRIES_PER_IP_PER_HOUR = 30;

/** Who the code signs in. */
export type SignInCodeKind = "member" | "contributor";

const normalise = (email: string) => email.trim().toLowerCase();

function hashCode(code: string, email: string, secret: string): string {
  return createHmac("sha256", secret).update(`${normalise(email)}:${code}`).digest("hex");
}

/**
 * A new code for this address, or null when it asked too often. The caller decides whether the
 * address belongs to a member before sending anything.
 */
export async function issueCode(
  db: Database,
  email: string,
  secret: string,
  now = new Date(),
  kind: SignInCodeKind = "member",
): Promise<string | null> {
  const address = normalise(email);
  const [recent] = await db
    .select({ n: count() })
    .from(signInCodes)
    .where(
      and(
        eq(signInCodes.kind, kind),
        eq(signInCodes.email, address),
        gt(signInCodes.createdAt, new Date(now.getTime() - WINDOW_MS)),
      ),
    );
  if ((recent?.n ?? 0) >= MAX_CODES_PER_WINDOW) return null;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(signInCodes).values({
    kind,
    email: address,
    codeHash: hashCode(code, address, secret),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    createdAt: now,
  });
  return code;
}

/** True when `code` is the latest live code for this address. Uses it up on success. */
export async function checkCode(
  db: Database,
  email: string,
  code: string,
  secret: string,
  now = new Date(),
  kind: SignInCodeKind = "member",
): Promise<boolean> {
  const address = normalise(email);
  const [latest] = await db
    .select()
    .from(signInCodes)
    .where(
      and(
        eq(signInCodes.kind, kind),
        eq(signInCodes.email, address),
        isNull(signInCodes.usedAt),
        gt(signInCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(signInCodes.createdAt), desc(signInCodes.id))
    .limit(1);
  if (!latest) return false;

  // Claim a try before comparing, in one statement: parallel guesses can't share a try.
  const claimed = await db
    .update(signInCodes)
    .set({ attempts: sql`${signInCodes.attempts} + 1` })
    .where(and(eq(signInCodes.id, latest.id), lt(signInCodes.attempts, MAX_ATTEMPTS), isNull(signInCodes.usedAt)))
    .returning({ id: signInCodes.id });
  if (claimed.length !== 1) return false;

  const given = Buffer.from(hashCode(code.trim(), address, secret));
  const stored = Buffer.from(latest.codeHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return false;
  // Use it up; a second request racing with the same code loses here.
  const used = await db
    .update(signInCodes)
    .set({ usedAt: now })
    .where(and(eq(signInCodes.id, latest.id), isNull(signInCodes.usedAt)))
    .returning({ id: signInCodes.id });
  return used.length === 1;
}

/** Codes older than a day are gone (the daily cron). */
export async function deleteOldCodes(db: Database, now = new Date()): Promise<number> {
  const gone = await db
    .delete(signInCodes)
    .where(lt(signInCodes.createdAt, new Date(now.getTime() - 24 * 3_600_000)))
    .returning({ id: signInCodes.id });
  return gone.length;
}
