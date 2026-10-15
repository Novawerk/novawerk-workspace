// Contributor accounts: signing in (GitHub or an emailed code), the profile, deleting the account.
// Contributors are not Members (NB-ADR-0013): nothing here touches `members`.

import { randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  toHandle,
  type ContributorMe,
  type ProfileAccent,
  type ProfileBanner,
  type ProfileUpdateInput,
} from "@nw/contracts";
import { contributorNotices, contributors, members, taskEvents, tasks, type Contributor, type Database } from "@nw/db";

import { TaskRuleError, isUniqueViolation } from "./errors.js";
import { iso } from "./people.js";
import { IN_PROGRESS_STATUSES } from "./state.js";

/** What we keep from GitHub's `GET /user`. The OAuth token itself is never stored. */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

const MAX_HANDLE = 39;

/** `base` as a free handle: "lena-k", else "lena-k-2", "lena-k-3"… */
export async function freeHandle(db: Database, base: string): Promise<string> {
  let stem = toHandle(base, MAX_HANDLE - 4);
  if (stem.length < 2) stem = "contributor";
  // /u/<handle> is shared with Members' public profiles.
  const taken = new Set([
    ...(
      await db
        .select({ handle: contributors.handle })
        .from(contributors)
        .where(sql`${contributors.handle} = ${stem} or ${contributors.handle} like ${`${stem}-%`}`)
    ).map((r) => r.handle),
    ...(
      await db
        .select({ handle: members.profileHandle })
        .from(members)
        .where(sql`${members.profileHandle} = ${stem} or ${members.profileHandle} like ${`${stem}-%`}`)
    ).map((r) => r.handle!),
  ]);
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** A Member's public profile uses this handle. */
async function memberHasHandle(db: Database, handle: string): Promise<boolean> {
  const [row] = await db.select({ id: members.id }).from(members).where(eq(members.profileHandle, handle)).limit(1);
  return Boolean(row);
}

export async function getContributor(db: Database, id: string): Promise<Contributor | undefined> {
  const [row] = await db.select().from(contributors).where(eq(contributors.id, id)).limit(1);
  return row;
}

/**
 * Sign in with GitHub. With `linkTo` (someone signed in by email pressed "Link GitHub") the
 * GitHub account is added to that contributor; otherwise we find the contributor by GitHub's
 * numeric id, or create one. Login, name and picture are refreshed every time.
 */
export async function signInWithGitHub(
  db: Database,
  gh: GitHubUser,
  linkTo?: string,
  now = new Date(),
): Promise<Contributor> {
  const [owner] = await db.select().from(contributors).where(eq(contributors.githubId, gh.id)).limit(1);
  if (linkTo) {
    if (owner && owner.id !== linkTo) {
      throw new TaskRuleError("conflict", "That GitHub account is linked to another contributor account");
    }
    const target = await getContributor(db, linkTo);
    if (!target) throw new TaskRuleError("not_found", "Not signed in");
    // Never swap one GitHub account for another: PRs are matched by it.
    if (target.githubId !== null && target.githubId !== gh.id) {
      throw new TaskRuleError("conflict", "This account is already linked to a different GitHub account");
    }
    const [linked] = await db
      .update(contributors)
      .set({
        githubId: gh.id,
        githubLogin: gh.login,
        avatarUrl: gh.avatarUrl,
        lastSignInAt: now,
        // A new sign-in method: earlier sessions end; the caller issues a new one.
        ...(target.githubId === null ? { sessionsRevokedAt: now } : {}),
      })
      .where(and(eq(contributors.id, linkTo), sql`(${contributors.githubId} is null or ${contributors.githubId} = ${gh.id})`))
      .returning()
      .catch((err: unknown) => {
        if (isUniqueViolation(err)) throw new TaskRuleError("conflict", "That GitHub account is linked to another contributor account");
        throw err;
      });
    if (!linked) throw new TaskRuleError("conflict", "This account is already linked to a different GitHub account");
    return linked;
  }
  if (owner) {
    const [updated] = await db
      .update(contributors)
      .set({ githubLogin: gh.login, avatarUrl: gh.avatarUrl, lastSignInAt: now })
      .where(eq(contributors.id, owner.id))
      .returning();
    return updated!;
  }
  try {
    return await insertWithFreeHandle(db, gh.login, (handle) => ({
      handle,
      displayName: gh.name?.trim() || gh.login,
      githubId: gh.id,
      githubLogin: gh.login,
      avatarUrl: gh.avatarUrl,
      lastSignInAt: now,
    }));
  } catch (err) {
    // Two callbacks for the same new person at once: the other one created the row.
    const [raced] = isUniqueViolation(err) ? await db.select().from(contributors).where(eq(contributors.githubId, gh.id)) : [];
    if (raced) return raced;
    throw err;
  }
}

/** Insert with a free handle from `base`, trying again if another sign-up takes it meanwhile. */
async function insertWithFreeHandle(
  db: Database,
  base: string,
  row: (handle: string) => typeof contributors.$inferInsert,
): Promise<Contributor> {
  for (let attempt = 0; ; attempt++) {
    const handle = await freeHandle(db, base);
    try {
      const [created] = await db.insert(contributors).values(row(handle)).returning();
      return created!;
    } catch (err) {
      const handleTaken = isUniqueViolation(err) && (await db.select({ id: contributors.id }).from(contributors).where(eq(contributors.handle, handle))).length > 0;
      if (!handleTaken || attempt >= 3) throw err;
    }
  }
}

/**
 * A neutral handle for an email sign-up, e.g. `contributor-7f3a`: nothing from the address, which
 * is private. They pick their own on first run (PATCH /contrib/me/profile).
 */
export const neutralHandle = () => `contributor-${randomBytes(2).toString("hex")}`;

/** Sign in with an emailed code (already checked): the contributor with this address, or a new one. */
export async function signInWithEmail(db: Database, email: string, now = new Date()): Promise<Contributor> {
  const address = email.trim().toLowerCase();
  const [existing] = await db.select().from(contributors).where(eq(contributors.email, address)).limit(1);
  if (existing) {
    const [updated] = await db
      .update(contributors)
      .set({ lastSignInAt: now })
      .where(eq(contributors.id, existing.id))
      .returning();
    return updated!;
  }
  try {
    return await insertWithFreeHandle(db, neutralHandle(), (handle) => ({
      handle,
      displayName: handle,
      email: address,
      lastSignInAt: now,
    }));
  } catch (err) {
    const [raced] = isUniqueViolation(err) ? await db.select().from(contributors).where(eq(contributors.email, address)) : [];
    if (raced) return raced;
    throw err;
  }
}

/** May propose and work on tasks: GitHub linked (to match pull requests), not suspended. */
export const canWork = (c: Contributor) => c.githubId !== null && c.suspendedAt === null;

/** For the signed-in contributor only. */
export function toContributorMe(c: Contributor): ContributorMe {
  return {
    id: c.id,
    handle: c.handle,
    displayName: c.displayName,
    email: c.email,
    github: c.githubId !== null ? { id: c.githubId, login: c.githubLogin } : null,
    avatarUrl: c.avatarUrl,
    bio: c.bio,
    about: c.about,
    links: c.links,
    accent: c.accent as ProfileAccent,
    banner: c.banner as ProfileBanner,
    public: c.public,
    onWall: c.onWall,
    pledgeAccepted: c.pledgeAcceptedAt !== null,
    defaultHandle: c.githubId === null && /^contributor-[0-9a-f]{4}(?:-\d+)?$/.test(c.handle),
    canWork: canWork(c),
    suspended: c.suspendedAt !== null,
    notifyReplies: c.notifyReplies,
    notifyReminders: c.notifyReminders,
    createdAt: iso(c.createdAt),
  };
}

/** PATCH /contrib/me/profile. A handle someone else has is a conflict on `handle`. */
export async function updateProfile(
  db: Database,
  contributorId: string,
  patch: ProfileUpdateInput,
  now = new Date(),
): Promise<Contributor> {
  const { acceptPledge, ...fields } = patch;
  const me = await getContributor(db, contributorId);
  if (!me) throw new TaskRuleError("not_found", "Not signed in");
  if (me.suspendedAt) throw new TaskRuleError("suspended", "This account is suspended");
  if (fields.handle) {
    const [other] = await db
      .select({ id: contributors.id })
      .from(contributors)
      .where(eq(contributors.handle, fields.handle))
      .limit(1);
    if (other && other.id !== contributorId) throw new TaskRuleError("conflict", "That handle is taken", "handle");
    if (await memberHasHandle(db, fields.handle)) throw new TaskRuleError("conflict", "That handle is taken", "handle");
  }
  const [row] = await db
    .update(contributors)
    .set({
      ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      ...(acceptPledge ? { pledgeAcceptedAt: sql`coalesce(${contributors.pledgeAcceptedAt}, ${now})` } : {}),
    })
    .where(eq(contributors.id, contributorId))
    .returning()
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) throw new TaskRuleError("conflict", "That handle is taken", "handle");
      throw err;
    });
  if (!row) throw new TaskRuleError("not_found", "Not signed in");
  return row;
}

/** Ends every session issued before now: sign-out, and later a suspension or a changed sign-in. */
export async function revokeSessions(db: Database, contributorId: string, now = new Date()): Promise<void> {
  await db.update(contributors).set({ sessionsRevokedAt: now }).where(eq(contributors.id, contributorId));
}

/**
 * Delete the account: the profile, proposals, votes and tokens go (foreign keys cascade). A task
 * they hold goes back on the board; tasks, posts and Werk rows keep "a former contributor".
 * Merged work stays in git history. `confirmHandle` must be their handle.
 */
export async function deleteContributor(db: Database, contributorId: string, confirmHandle: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [me] = await tx.select().from(contributors).where(eq(contributors.id, contributorId)).limit(1);
    if (!me) throw new TaskRuleError("not_found", "Not signed in");
    if (confirmHandle.trim().toLowerCase() !== me.handle) {
      throw new TaskRuleError("invalid", "Type your handle to confirm", "confirmHandle");
    }
    const held = await tx
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, contributorId), inArray(tasks.status, [...IN_PROGRESS_STATUSES])));
    if (held.length) {
      await tx
        .update(tasks)
        .set({ status: "open", assigneeId: null, assignedAt: null, prUrl: null, lastActivityAt: null, extendedAt: null })
        .where(inArray(tasks.id, held.map((t) => t.id)));
      await tx.insert(taskEvents).values(
        held.map((t) => ({
          taskId: t.id,
          kind: "released",
          fromStatus: t.status,
          toStatus: "open" as const,
          note: "The person on it deleted their account",
        })),
      );
    }
    await tx.delete(contributors).where(eq(contributors.id, contributorId));
    // One last email, to the address the account had (NB-ADR-0013). The notices cron sends it,
    // then clears the address; it is cleared after 7 days at the latest.
    if (me.email) {
      await tx
        .insert(contributorNotices)
        .values({ key: `deleted:${contributorId}`, kind: "account_deleted", toEmail: me.email, data: { handle: me.handle } })
        .onConflictDoNothing({ target: contributorNotices.key });
    }
  });
}
