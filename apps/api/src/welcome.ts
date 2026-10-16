// The welcome email (NB-ADR-0014): once per account, when it is made. It goes out from the
// sign-in that makes the account (src/routes/auth.ts), to the address that sign-in just proved:
// the one they signed in with, else GitHub's verified one. `members.welcome_sent_at` is claimed
// in one statement before anything is sent, so a later sign-in, a newly linked way in or two
// sign-ins at once never send it again. No outbox: a fixed template about their own account
// (@nw/email sendWelcome). Accounts from before it were marked by the migration.

import { and, eq, isNull } from "drizzle-orm";

import { members, type Database, type Member } from "@nw/db";

import type { Logger, WelcomeSender } from "./types.js";

/** The neutral handle an email sign-up starts with (`contributor-7f3a`) isn't a name to greet. */
const NEUTRAL = /^contributor-[0-9a-f]{4}(?:-\d+)?$/;

export async function welcomeOnce(
  db: Database,
  account: Pick<Member, "id" | "displayName" | "handle" | "email" | "notifyEmail" | "welcomeSentAt">,
  send: WelcomeSender | undefined,
  logger: Logger,
  now = new Date(),
): Promise<void> {
  if (account.welcomeSentAt) return;
  const [claimed] = await db
    .update(members)
    .set({ welcomeSentAt: now })
    .where(and(eq(members.id, account.id), isNull(members.welcomeSentAt)))
    .returning({ id: members.id });
  if (!claimed) return;
  // No address yet (GitHub without a verified one): settled without a mail, never sent later.
  const to = account.email ?? account.notifyEmail;
  if (!to || !send) return;
  const name = NEUTRAL.test(account.displayName) ? "" : account.displayName;
  try {
    await send(to, name, { idempotencyKey: `welcome:${account.id}` });
  } catch (err) {
    logger.error("[api] could not send a welcome email:", err instanceof Error ? err.message : err);
  }
}
