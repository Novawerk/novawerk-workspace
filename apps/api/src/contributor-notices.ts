// Emails to contributors about their own account and tasks (NB-ADR-0013). This only turns what
// happened into mail; deciding what happens (the inactivity reminder, the release after 14 idle
// days, extensions) is the board's (@nw/tasks, the GitHub sync). GET /cron/contributor-notices
// runs every few minutes:
//
//   1. collectNotices(): turn what happened into `contributor_notices` rows, one per notice and
//      recipient. Sources: task events (by `subject_contributor_id`), proposals not chosen and
//      posts. Every row has a unique key, so collecting twice queues nothing new. It looks back
//      7 days; older things aren't news.
//   2. dispatchNotices(): send what is pending, other kinds first, then replies whose hour has
//      passed (one mail per task and person per hour). A row is claimed (pending → sending)
//      before it goes, Resend gets an idempotency key, and a failure after Resend took it never
//      puts it back: it goes out at most once. Nothing goes to a suspended account, an account
//      without a verified address, someone who turned that kind off, or about something stale
//      (older than 48 hours, or a task that changed hands).
//   3. tidy(): rows stuck `sending` for 15 minutes become `failed` (unknown outcome); finished
//      rows go after 30 days; a deleted account's address after 7 days at the latest.
//
// The address is the contributor's own `contributors.email` (set when they sign in with an emailed
// code, so verified), else `notify_email` (GitHub's verified primary email; never a sign-in). `account_deleted` keeps the address on its row until
// that last mail is sent.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { OPTIONAL_CONTRIBUTOR_NOTICES, type ContributorNoticeKind } from "@nw/contracts";
import {
  contributorNotices,
  contributors,
  taskEvents,
  taskPosts,
  taskProposals,
  tasks,
  werkLedger,
  type ContributorNotice,
  type Database,
} from "@nw/db";
import type { ContributorNoticeMail } from "@nw/email";
import { idleReleaseAt, idleSince } from "@nw/tasks";

import type { Logger } from "./types.js";

/**
 * Sends one notice to one address. Wraps `sendContributorNotice` from @nw/email. Throws on
 * failure; an error with `code: "rate_limit_exceeded"` means Resend took nothing.
 */
export type ContributorNoticeSender = (
  to: string,
  mail: ContributorNoticeMail,
  opts: { idempotencyKey: string; unsubscribeUrl?: string },
) => Promise<{ id?: string } | unknown>;

export const LOOKBACK_MS = 7 * 86_400_000;
export const REPLY_BATCH_MS = 60 * 60_000;
export const STALE_MS = 48 * 3_600_000;
export const STUCK_MS = 15 * 60_000;
export const MAX_SEND_ATTEMPTS = 3;
const DAY_MS = 86_400_000;
const BATCH = 200;

type Data = Record<string, string | number | boolean | null>;
type NewNotice = { key: string; kind: ContributorNoticeKind; contributorId: string; taskId: number; data?: Data; createdAt: Date };

// ─── 1. Collect ──────────────────────────────────────────────────────────────

/** Queues the notices for what happened in the last 7 days. Returns how many are new. */
export async function collectNotices(db: Database, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const rows: NewNotice[] = [
    ...(await fromEvents(db, since)),
    ...(await fromProposals(db, since)),
    ...(await fromPosts(db, since)),
  ];
  if (!rows.length) return 0;
  const inserted = await db
    .insert(contributorNotices)
    .values(rows.map((r) => ({ ...r, data: r.data ?? {} })))
    .onConflictDoNothing({ target: contributorNotices.key })
    .returning({ id: contributorNotices.id });
  return inserted.length;
}

/** Task events → notices for the contributor they are about. */
async function fromEvents(db: Database, since: Date): Promise<NewNotice[]> {
  const events = await db
    .select({
      event: taskEvents,
      duplicateOf: tasks.duplicateOf,
      assigneeId: tasks.assigneeId,
      assignedAt: tasks.assignedAt,
      lastActivityAt: tasks.lastActivityAt,
      extendedAt: tasks.extendedAt,
      updatedAt: tasks.updatedAt,
    })
    .from(taskEvents)
    .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
    .where(
      and(
        gt(taskEvents.createdAt, since),
        or(isNotNull(taskEvents.subjectContributorId), eq(taskEvents.kind, "inactivity_reminder")),
      ),
    );
  const out: NewNotice[] = [];
  for (const { event: e, duplicateOf, assigneeId, ...idle } of events) {
    // A reminder written before subject_contributor_id was set on it goes to whoever holds the task.
    const to = e.subjectContributorId ?? (e.kind === "inactivity_reminder" ? assigneeId : null);
    if (!to) continue;
    const base = { key: `event:${e.id}`, contributorId: to, taskId: e.taskId, createdAt: e.createdAt };
    const system = e.actorContributorId === null && e.actorMemberId === null;
    switch (e.kind) {
      case "assigned":
        out.push({ ...base, kind: "proposal_chosen" });
        break;
      case "accepted":
        out.push({ ...base, kind: "suggestion_accepted", data: { yours: e.toStatus === "assigned" } });
        break;
      case "declined":
        out.push({ ...base, kind: "suggestion_declined", data: { note: e.note } });
        break;
      case "duplicate":
        out.push({ ...base, kind: "suggestion_duplicate", data: { duplicateOf: duplicateOf ?? null } });
        break;
      case "info_requested":
        out.push({ ...base, kind: "suggestion_needs_info", data: { note: e.note } });
        break;
      case "released":
        // They released it themselves: no mail about their own click.
        if (e.actorContributorId !== to) out.push({ ...base, kind: "released", data: { idle: system, note: e.note } });
        break;
      case "merged": {
        const [award] = await db
          .select({ delta: werkLedger.delta })
          .from(werkLedger)
          .where(and(eq(werkLedger.taskId, e.taskId), eq(werkLedger.contributorId, to), e.prUrl ? eq(werkLedger.pr, e.prUrl) : isNull(werkLedger.byMemberId)))
          .limit(1);
        if (award && award.delta > 0) out.push({ ...base, kind: "werk_awarded", data: { werk: award.delta } });
        break;
      }
      case "inactivity_reminder": {
        // The exact times the board wrote on the event (task_events.data); for a reminder written
        // before that, the task row, the way the board computes them (@nw/tasks idle.ts).
        const recorded = reminderTimes(e.data);
        const since = recorded?.idleSince ?? idleSince(idle);
        const releaseAt = recorded?.releaseAt ?? idleReleaseAt(idle);
        out.push({
          ...base,
          kind: "reminder",
          data: {
            idleDays: Math.max(0, Math.floor((e.createdAt.getTime() - since.getTime()) / DAY_MS)),
            releaseOn: releaseAt.toISOString().slice(0, 10),
          },
        });
        break;
      }
      case "closed":
        // A member closed the task they were on (subject: the assignee; open tasks have none).
        out.push({ ...base, kind: "task_closed", data: { note: e.note } });
        break;
      // "extended" is granted on request, once: they just clicked it, so no mail.
    }
  }
  return out;
}

/** Plans a member didn't pick, with their private note. */
async function fromProposals(db: Database, since: Date): Promise<NewNotice[]> {
  const rows = await db
    .select()
    .from(taskProposals)
    .where(and(eq(taskProposals.status, "not_chosen"), gt(taskProposals.decidedAt, since)));
  return rows.map((p) => ({
    key: `proposal:${p.id}`,
    kind: "proposal_not_chosen" as const,
    contributorId: p.contributorId,
    taskId: p.taskId,
    data: { note: p.declineNote },
    createdAt: p.decidedAt!,
  }));
}

/**
 * New posts → a `replies` notice for: the author of the post replied to, the person on the
 * task, and the person who suggested it while it is still a suggestion. Never the author.
 */
async function fromPosts(db: Database, since: Date): Promise<NewNotice[]> {
  const posts = await db
    .select({
      id: taskPosts.id,
      taskId: taskPosts.taskId,
      author: taskPosts.authorContributorId,
      parentId: taskPosts.parentId,
      createdAt: taskPosts.createdAt,
      status: tasks.status,
      assigneeId: tasks.assigneeId,
      suggestedBy: tasks.suggestedBy,
    })
    .from(taskPosts)
    .innerJoin(tasks, eq(tasks.id, taskPosts.taskId))
    .where(and(gt(taskPosts.createdAt, since), isNull(taskPosts.hiddenAt)));
  const parentIds = [...new Set(posts.flatMap((p) => (p.parentId ? [p.parentId] : [])))];
  const parents = parentIds.length
    ? await db
        .select({ id: taskPosts.id, author: taskPosts.authorContributorId })
        .from(taskPosts)
        .where(inArray(taskPosts.id, parentIds))
    : [];
  const parentAuthor = new Map(parents.map((p) => [p.id, p.author]));

  const out: NewNotice[] = [];
  for (const p of posts) {
    const recipients = new Map<string, boolean>();
    const repliedTo = p.parentId ? parentAuthor.get(p.parentId) : null;
    if (repliedTo) recipients.set(repliedTo, true);
    if (p.assigneeId && (p.status === "assigned" || p.status === "in_review") && !recipients.has(p.assigneeId)) {
      recipients.set(p.assigneeId, false);
    }
    if (p.suggestedBy && p.status === "suggested" && !recipients.has(p.suggestedBy)) recipients.set(p.suggestedBy, false);
    if (p.author) recipients.delete(p.author);
    for (const [to, toYou] of recipients) {
      out.push({
        key: `post:${p.id}:${to}`,
        kind: "replies",
        contributorId: to,
        taskId: p.taskId,
        data: { toYou },
        createdAt: p.createdAt,
      });
    }
  }
  return out;
}

// ─── 2. Dispatch ─────────────────────────────────────────────────────────────

export interface DispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}

type Row = {
  notice: ContributorNotice;
  email: string | null;
  suspendedAt: Date | null;
  notifyReplies: boolean | null;
  notifyReminders: boolean | null;
  title: string | null;
  assigneeId: string | null;
};

/** Why this one doesn't go out, or null when it may. */
function skipReason(r: Row, now: Date): string | null {
  if (r.notice.kind === "account_deleted") return r.notice.toEmail ? null : "no_address";
  if (now.getTime() - r.notice.createdAt.getTime() > STALE_MS) return "stale";
  if (!r.notice.contributorId || r.notifyReplies === null) return "deleted";
  if (r.suspendedAt) return "suspended";
  if (!r.email) return "no_address";
  const setting = OPTIONAL_CONTRIBUTOR_NOTICES[r.notice.kind as keyof typeof OPTIONAL_CONTRIBUTOR_NOTICES];
  if (setting && !r[setting]) return "turned_off";
  if (r.notice.taskId !== null && r.title === null) return "task_gone";
  // "It's yours" and "still on it?" only while it still is.
  if ((r.notice.kind === "proposal_chosen" || r.notice.kind === "reminder") && r.assigneeId !== r.notice.contributorId) return "outdated";
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The template's input from a row; null when the data doesn't fit (a bug: the row fails). */
async function mailFor(db: Database, r: Row, group: Row[]): Promise<ContributorNoticeMail | null> {
  const d = r.notice.data;
  if (r.notice.kind === "account_deleted") return { kind: "account_deleted", handle: str(d.handle) ?? "you" };
  const task = { id: r.notice.taskId!, title: r.title ?? "" };
  switch (r.notice.kind as ContributorNoticeKind) {
    case "proposal_chosen":
      return { kind: "proposal_chosen", task };
    case "proposal_not_chosen":
      return { kind: "proposal_not_chosen", task, note: str(d.note) ?? "We picked another plan this time." };
    case "replies":
      return { kind: "replies", task, posts: group.length, repliesToYou: group.filter((g) => g.notice.data.toYou === true).length };
    case "reminder":
      return { kind: "reminder", task, idleDays: typeof d.idleDays === "number" ? d.idleDays : null, releaseOn: str(d.releaseOn) };
    case "released":
      return { kind: "released", task, idle: d.idle === true, note: str(d.note) };
    case "task_closed":
      return { kind: "task_closed", task, note: str(d.note) };
    case "suggestion_accepted":
      return { kind: "suggestion_accepted", task, yours: d.yours === true };
    case "suggestion_declined":
      return { kind: "suggestion_declined", task, note: str(d.note) ?? "" };
    case "suggestion_duplicate": {
      const id = typeof d.duplicateOf === "number" ? d.duplicateOf : null;
      const [original] = id ? await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, id)) : [];
      return { kind: "suggestion_duplicate", task, duplicateOf: original ?? null };
    }
    case "suggestion_needs_info":
      return { kind: "suggestion_needs_info", task, note: str(d.note) };
    case "werk_awarded":
      return typeof d.werk === "number" ? { kind: "werk_awarded", task, werk: d.werk } : null;
    default:
      return null;
  }
}

// ─── One-click "turn these off" (List-Unsubscribe) ───────────────────────────

export type NoticeSetting = (typeof OPTIONAL_CONTRIBUTOR_NOTICES)[keyof typeof OPTIONAL_CONTRIBUTOR_NOTICES];
const SETTINGS: readonly NoticeSetting[] = Object.values(OPTIONAL_CONTRIBUTOR_NOTICES);

function noticeSignature(contributorId: string, setting: NoticeSetting, secret: string): string {
  return createHmac("sha256", secret).update(`contributor-notice-off:${contributorId}:${setting}`).digest("base64url");
}

/** The List-Unsubscribe URL for a kind people can turn off: signed, so only the mail's owner has it. */
export function noticeOffUrl(apiUrl: string, contributorId: string, setting: NoticeSetting, secret: string): string {
  const q = new URLSearchParams({ c: contributorId, s: setting, sig: noticeSignature(contributorId, setting, secret) });
  return `${apiUrl}/public/contributor-notices/off?${q}`;
}

/** POST /public/contributor-notices/off: turns that kind off for that contributor. False for a bad signature. */
export async function turnNoticesOff(
  db: Database,
  q: { c?: string; s?: string; sig?: string },
  secret: string,
): Promise<boolean> {
  const setting = SETTINGS.find((x) => x === q.s);
  if (!q.c || !setting || !q.sig || !/^[0-9a-f-]{36}$/i.test(q.c)) return false;
  const expected = Buffer.from(noticeSignature(q.c, setting, secret));
  const given = Buffer.from(q.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  await db.update(contributors).set({ [setting]: false }).where(eq(contributors.id, q.c));
  return true;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** For the List-Unsubscribe URL of replies and reminders. Without it they carry none. */
  unsubscribe?: { apiUrl: string; secret: string };
  now?: Date;
}

const select = (db: Database) =>
  db
    .select({
      notice: contributorNotices,
      email: sql<string | null>`coalesce(${contributors.email}, ${contributors.notifyEmail})`,
      suspendedAt: contributors.suspendedAt,
      notifyReplies: contributors.notifyReplies,
      notifyReminders: contributors.notifyReminders,
      title: tasks.title,
      assigneeId: tasks.assigneeId,
    })
    .from(contributorNotices)
    .leftJoin(contributors, eq(contributors.id, contributorNotices.contributorId))
    .leftJoin(tasks, eq(tasks.id, contributorNotices.taskId));

/** Sends what is pending. Without a sender (no Resend key in production) nothing moves. */
export async function dispatchNotices(
  db: Database,
  send: ContributorNoticeSender | undefined,
  logger: Logger,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const result: DispatchResult = { sent: 0, skipped: 0, failed: 0 };
  if (!send) return result;

  // Other kinds first; then replies, leaving out every person and task that got a replies mail
  // in the last hour (so waiting replies never crowd out the rest).
  const others: Row[] = await select(db)
    .where(and(eq(contributorNotices.status, "pending"), ne(contributorNotices.kind, "replies")))
    .orderBy(asc(contributorNotices.createdAt))
    .limit(BATCH);
  const recent = alias(contributorNotices, "recent");
  const replies: Row[] = await select(db)
    .where(
      and(
        eq(contributorNotices.status, "pending"),
        eq(contributorNotices.kind, "replies"),
        notExists(
          db
            .select({ id: recent.id })
            .from(recent)
            .where(
              and(
                eq(recent.kind, "replies"),
                eq(recent.contributorId, contributorNotices.contributorId),
                eq(recent.taskId, contributorNotices.taskId),
                gt(recent.sentAt, new Date(now.getTime() - REPLY_BATCH_MS)),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(contributorNotices.createdAt))
    .limit(BATCH);

  const groups = new Map<string, Row[]>();
  for (const r of [...others, ...replies]) {
    const key = r.notice.kind === "replies" ? `replies:${r.notice.contributorId}:${r.notice.taskId}` : r.notice.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const ids = group.map((g) => g.notice.id);
    const reason = skipReason(first, now);
    if (reason) {
      const skipped = await db
        .update(contributorNotices)
        .set({ status: "skipped", reason, toEmail: null })
        .where(and(inArray(contributorNotices.id, ids), eq(contributorNotices.status, "pending")))
        .returning({ id: contributorNotices.id });
      result.skipped += skipped.length;
      continue;
    }

    // Claim: a second run racing on the same rows gets none of them.
    const claimed = await db
      .update(contributorNotices)
      .set({ status: "sending", claimedAt: now, attempts: sql`${contributorNotices.attempts} + 1` })
      .where(and(inArray(contributorNotices.id, ids), eq(contributorNotices.status, "pending")))
      .returning({ id: contributorNotices.id, key: contributorNotices.key, attempts: contributorNotices.attempts });
    if (!claimed.length) continue;
    const claimedIds = claimed.map((c) => c.id);
    const mine = group.filter((g) => claimedIds.includes(g.notice.id));
    const to = first.notice.kind === "account_deleted" ? first.notice.toEmail! : first.email!;
    // The same notice (or the same set of replies) always has the same key: Resend sends it once.
    const idempotencyKey =
      first.notice.kind === "replies"
        ? `cn-replies-${createHash("sha256").update(claimed.map((c) => c.key).sort().join(",")).digest("hex").slice(0, 40)}`
        : `cn-${claimed[0]!.key}`;
    const setting = OPTIONAL_CONTRIBUTOR_NOTICES[first.notice.kind as keyof typeof OPTIONAL_CONTRIBUTOR_NOTICES];
    const unsubscribeUrl =
      setting && opts.unsubscribe ? noticeOffUrl(opts.unsubscribe.apiUrl, first.notice.contributorId!, setting, opts.unsubscribe.secret) : undefined;

    let sent: { id?: string } | undefined;
    try {
      const mail = await mailFor(db, first, mine);
      if (!mail) throw new Error(`No mail for a ${first.notice.kind} notice with data ${JSON.stringify(first.notice.data)}`);
      sent = (await send(to, mail, { idempotencyKey, ...(unsubscribeUrl ? { unsubscribeUrl } : {}) })) as { id?: string } | undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if ((err as { code?: string }).code === "rate_limit_exceeded") {
        // Resend took nothing: not an attempt. Stop this run; the next one carries on.
        await db
          .update(contributorNotices)
          .set({ status: "pending", claimedAt: null, attempts: sql`${contributorNotices.attempts} - 1` })
          .where(inArray(contributorNotices.id, claimedIds));
        logger.warn("[contributor-notices] Resend rate limit: stopping this run");
        break;
      }
      const giveUp = Math.max(...claimed.map((c) => c.attempts)) >= MAX_SEND_ATTEMPTS;
      logger.error(`[contributor-notices] ${first.notice.kind} failed${giveUp ? ", giving up" : ""}:`, message);
      await db
        .update(contributorNotices)
        .set(
          giveUp
            ? { status: "failed", reason: message.slice(0, 500), toEmail: null }
            : { status: "pending", claimedAt: null, reason: message.slice(0, 500) },
        )
        .where(inArray(contributorNotices.id, claimedIds));
      if (giveUp) result.failed += claimedIds.length;
      continue;
    }
    // Resend has it. If recording that fails, the rows stay `sending` (swept to failed later):
    // never back to pending, never sent twice.
    try {
      await db
        .update(contributorNotices)
        .set({ status: "sent", sentAt: now, providerMessageId: sent?.id ?? null, reason: null, toEmail: null })
        .where(inArray(contributorNotices.id, claimedIds));
      result.sent += claimedIds.length;
    } catch (err) {
      logger.error(`[contributor-notices] sent ${first.notice.kind} but couldn't record it; left as sending:`, err);
    }
  }
  return result;
}

// ─── 3. Tidy ─────────────────────────────────────────────────────────────────

export interface TidyResult {
  /** Stuck `sending` rows marked failed. */
  stuck: number;
  pruned: number;
}

export async function tidyNotices(db: Database, logger: Logger, now = new Date()): Promise<TidyResult> {
  const stuck = await db
    .update(contributorNotices)
    .set({ status: "failed", reason: "unknown_outcome: the run stopped while sending", toEmail: null })
    .where(and(eq(contributorNotices.status, "sending"), lt(contributorNotices.claimedAt, new Date(now.getTime() - STUCK_MS))))
    .returning({ id: contributorNotices.id, kind: contributorNotices.kind });
  if (stuck.length) logger.warn(`[contributor-notices] ${stuck.length} stuck in sending, marked failed (maybe sent):`, stuck.map((s) => s.kind).join(", "));

  // A deleted account's address goes after 7 days, sent or not.
  await db
    .update(contributorNotices)
    .set({ toEmail: null })
    .where(
      and(
        eq(contributorNotices.kind, "account_deleted"),
        isNotNull(contributorNotices.toEmail),
        lt(contributorNotices.createdAt, new Date(now.getTime() - 7 * DAY_MS)),
      ),
    );
  // Finished rows after 30 days: well past the 7-day lookback, so nothing is queued again.
  const pruned = await db
    .delete(contributorNotices)
    .where(
      and(
        inArray(contributorNotices.status, ["sent", "skipped", "failed"]),
        lt(contributorNotices.createdAt, new Date(now.getTime() - 30 * DAY_MS)),
      ),
    )
    .returning({ id: contributorNotices.id });
  return { stuck: stuck.length, pruned: pruned.length };
}

// ─── The cron ────────────────────────────────────────────────────────────────

export interface NoticeRun extends DispatchResult, TidyResult {
  queued: number;
}

export async function runContributorNotices(
  db: Database,
  send: ContributorNoticeSender | undefined,
  logger: Logger,
  opts: DispatchOptions = {},
): Promise<NoticeRun> {
  const now = opts.now ?? new Date();
  const tidied = await tidyNotices(db, logger, now);
  const queued = await collectNotices(db, now);
  const sent = await dispatchNotices(db, send, logger, { ...opts, now });
  return { queued, ...sent, ...tidied };
}

/** `{ idleSince, releaseAt }` from an inactivity_reminder's data, when both are real dates. */
function reminderTimes(data: unknown): { idleSince: Date; releaseAt: Date } | null {
  if (!data || typeof data !== "object") return null;
  const { idleSince: a, releaseAt: b } = data as Record<string, unknown>;
  const since = typeof a === "string" ? new Date(a) : null;
  const release = typeof b === "string" ? new Date(b) : null;
  return since && release && !Number.isNaN(since.getTime()) && !Number.isNaN(release.getTime())
    ? { idleSince: since, releaseAt: release }
    : null;
}
