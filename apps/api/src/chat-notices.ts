// Task board news in the team's room in Novawerk Chat (apps/chat, a bot posting to one room).
// Two sorts: what needs one of us (a plan waiting for a maintainer, a PR to review, a suggestion
// to triage) and what is only news (an S task the system gave to the first plan). GET
// /cron/chat-notices runs every 10 minutes, next to the contributor notices:
//
//   1. collectChatNotices(): turn the last 24 hours into `chat_notices` rows. Sources: pending
//      proposals, task events (`assigned` by the system, `pr_linked`) and suggestions still
//      waiting. Every row has a unique key, so collecting twice queues nothing new.
//   2. dispatchChatNotices(): post what is pending, oldest first. A row is claimed (pending →
//      sending) before it goes. When the chat says no, the row goes back and the run stops (the
//      chat is likely down); after 3 tries it is failed. Rows older than 48 hours are skipped.
//   3. tidy: rows stuck `sending` for 15 minutes become failed; finished rows go after 30 days.
//
// A cron over the database, not a call in each route: plans, suggestions and PRs come in through
// the website, agents (MCP), the GitHub webhook and the nightly GitHub sync, and the scan sees all
// of them; a chat that is down delays the news instead of losing it; no request waits on the chat.
//
// Messages carry the task number, its title, a handle and links (task, admin queue, PR). Nothing
// private: no email, no proposal text, no decline note. Without CHAT_BOT_URL nothing runs.

import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { chatNotices, members, taskEvents, taskProposals, tasks, type Database } from "@nw/db";

import type { Logger } from "./types.js";

/** Posts one message (HTML) to the room. Throws when the chat doesn't take it. */
export type ChatPoster = (html: string) => Promise<void>;

export const CHAT_NOTICE_KINDS = ["proposal_waiting", "auto_assigned", "pr_review", "suggestion"] as const;
export type ChatNoticeKind = (typeof CHAT_NOTICE_KINDS)[number];

export const CHAT_LOOKBACK_MS = 24 * 3_600_000;
export const CHAT_STALE_MS = 48 * 3_600_000;
export const CHAT_STUCK_MS = 15 * 60_000;
/**
 * An S task's plan is chosen by the system right after it is sent (autoChooseSmall, @nw/tasks),
 * in its own transaction. One still pending this long after it was sent waits for a maintainer.
 */
export const SMALL_GRACE_MS = 2 * 60_000;
export const MAX_CHAT_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;
const BATCH = 50;
const DAY_MS = 86_400_000;

/** The links in a message. */
export interface ChatLinks {
  webUrl: string;
  adminUrl: string;
}

/** POSTs to the bot's messages URL (`https://chat…/rooms/<room>/<bot key>/messages`). */
export function chatBotPoster(url: string, fetchImpl: typeof fetch = fetch): ChatPoster {
  return async (html) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // The URL holds the bot key: never in an error or a log line.
    if (!res.ok) throw new Error(`the chat answered ${res.status}`);
  };
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** Text and double-quoted attributes. */
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (href: string, label: string) => `<a href="${escape(href)}">${escape(label)}</a>`;
const who = (handle: string | null) => (handle ? `@${handle}` : "a former contributor");

interface TaskRef {
  id: number;
  title: string;
}

/** "To do" first for what needs one of us, "FYI" for news. */
function message(lead: "To do" | "FYI", task: TaskRef, text: string, links: [string, string][]): string {
  return `<strong>${lead}</strong> · <strong>NW-${task.id}</strong> ${escape(task.title)}: ${escape(text)} ${links
    .map(([href, label]) => link(href, label))
    .join(" · ")}`;
}

export function proposalWaitingMessage(l: ChatLinks, task: TaskRef & { size: string | null }, handle: string | null): string {
  const text =
    task.size === "S"
      ? `${who(handle)}'s plan on this S task wasn't chosen automatically and waits for a maintainer.`
      : `new plan from ${who(handle)}, waiting for a maintainer.`;
  return message("To do", task, text, [
    [`${l.adminUrl}/proposals`, "Proposals"],
    [`${l.webUrl}/tasks/${task.id}`, "Task"],
  ]);
}

export function autoAssignedMessage(l: ChatLinks, task: TaskRef, handle: string | null): string {
  return message("FYI", task, `S task, given to ${who(handle)} automatically.`, [[`${l.webUrl}/tasks/${task.id}`, "Task"]]);
}

export function prReviewMessage(l: ChatLinks, task: TaskRef, handle: string | null, prUrl: string | null): string {
  return message("To do", task, `pull request from ${who(handle)} to review.`, [
    ...(prUrl ? ([[prUrl, "Pull request"]] as [string, string][]) : []),
    [`${l.webUrl}/tasks/${task.id}`, "Task"],
  ]);
}

export function suggestionMessage(l: ChatLinks, task: TaskRef, handle: string | null): string {
  return message("To do", task, `new suggestion from ${who(handle)} to triage.`, [
    [`${l.adminUrl}/suggestions?id=${task.id}`, "Suggestions"],
    [`${l.webUrl}/tasks/${task.id}`, "Task"],
  ]);
}

// ─── 1. Collect ──────────────────────────────────────────────────────────────

type NewChatNotice = { key: string; kind: ChatNoticeKind; taskId: number; body: string; createdAt: Date };

/** Queues what happened in the last 24 hours. Returns how many rows are new. */
export async function collectChatNotices(db: Database, links: ChatLinks, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - CHAT_LOOKBACK_MS);
  const rows = [
    ...(await waitingProposals(db, links, since, now)),
    ...(await fromEvents(db, links, since)),
    ...(await waitingSuggestions(db, links, since)),
  ];
  if (!rows.length) return 0;
  const inserted = await db
    .insert(chatNotices)
    .values(rows)
    .onConflictDoNothing({ target: chatNotices.key })
    .returning({ id: chatNotices.id });
  return inserted.length;
}

/** Sent plans on open tasks that are still pending (drafts don't count until confirmed). */
async function waitingProposals(db: Database, links: ChatLinks, since: Date, now: Date): Promise<NewChatNotice[]> {
  const rows = await db
    .select({ id: taskProposals.id, updatedAt: taskProposals.updatedAt, taskId: tasks.id, title: tasks.title, size: tasks.size, handle: members.handle })
    .from(taskProposals)
    .innerJoin(tasks, eq(tasks.id, taskProposals.taskId))
    .leftJoin(members, eq(members.id, taskProposals.contributorId))
    .where(
      and(
        eq(taskProposals.status, "pending"),
        eq(tasks.status, "open"),
        gt(taskProposals.updatedAt, since),
        // S: give the system its moment to choose it first.
        or(sql`${tasks.size} is distinct from 'S'`, lt(taskProposals.updatedAt, new Date(now.getTime() - SMALL_GRACE_MS))),
      ),
    );
  return rows.map((r) => ({
    key: `proposal:${r.id}`,
    kind: "proposal_waiting" as const,
    taskId: r.taskId,
    body: proposalWaitingMessage(links, { id: r.taskId, title: r.title, size: r.size }, r.handle),
    createdAt: r.updatedAt,
  }));
}

/** A task the system gave away (an S task's first plan), and a PR linked to a task. */
async function fromEvents(db: Database, links: ChatLinks, since: Date): Promise<NewChatNotice[]> {
  const rows = await db
    .select({ event: taskEvents, title: tasks.title, handle: members.handle })
    .from(taskEvents)
    .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
    .leftJoin(members, eq(members.id, sql`coalesce(${taskEvents.subjectContributorId}, ${taskEvents.actorContributorId}, ${tasks.assigneeId})`))
    .where(
      and(
        gt(taskEvents.createdAt, since),
        or(
          and(eq(taskEvents.kind, "assigned"), isNull(taskEvents.actorMemberId), isNull(taskEvents.actorContributorId)),
          eq(taskEvents.kind, "pr_linked"),
        ),
      ),
    );
  return rows.map(({ event: e, title, handle }) => {
    const task = { id: e.taskId, title };
    const base = { key: `event:${e.id}`, taskId: e.taskId, createdAt: e.createdAt };
    return e.kind === "pr_linked"
      ? { ...base, kind: "pr_review" as const, body: prReviewMessage(links, task, handle, e.prUrl) }
      : { ...base, kind: "auto_assigned" as const, body: autoAssignedMessage(links, task, handle) };
  });
}

/** Suggestions still waiting for triage. */
async function waitingSuggestions(db: Database, links: ChatLinks, since: Date): Promise<NewChatNotice[]> {
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, createdAt: tasks.createdAt, handle: members.handle })
    .from(tasks)
    .leftJoin(members, eq(members.id, tasks.suggestedBy))
    .where(and(eq(tasks.status, "suggested"), gt(tasks.createdAt, since)));
  return rows.map((r) => ({
    key: `suggestion:${r.id}`,
    kind: "suggestion" as const,
    taskId: r.id,
    body: suggestionMessage(links, r, r.handle),
    createdAt: r.createdAt,
  }));
}

// ─── 2. Dispatch ─────────────────────────────────────────────────────────────

export interface ChatDispatchResult {
  sent: number;
  skipped: number;
  failed: number;
}

export async function dispatchChatNotices(db: Database, post: ChatPoster, logger: Logger, now = new Date()): Promise<ChatDispatchResult> {
  const result: ChatDispatchResult = { sent: 0, skipped: 0, failed: 0 };
  // Old news stays out of the room: a chat that was down for days doesn't get a flood.
  const stale = await db
    .update(chatNotices)
    .set({ status: "skipped", reason: "stale" })
    .where(and(eq(chatNotices.status, "pending"), lt(chatNotices.createdAt, new Date(now.getTime() - CHAT_STALE_MS))))
    .returning({ id: chatNotices.id });
  result.skipped = stale.length;

  const pending = await db
    .select()
    .from(chatNotices)
    .where(eq(chatNotices.status, "pending"))
    .orderBy(asc(chatNotices.createdAt), asc(chatNotices.key))
    .limit(BATCH);
  for (const row of pending) {
    const [claimed] = await db
      .update(chatNotices)
      .set({ status: "sending", claimedAt: now, attempts: sql`${chatNotices.attempts} + 1` })
      .where(and(eq(chatNotices.id, row.id), eq(chatNotices.status, "pending")))
      .returning({ attempts: chatNotices.attempts });
    if (!claimed) continue;
    try {
      await post(row.body);
    } catch (err) {
      const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const giveUp = claimed.attempts >= MAX_CHAT_ATTEMPTS;
      logger.warn(`[chat-notices] posting ${row.kind} failed${giveUp ? ", giving up" : ""}:`, reason);
      await db
        .update(chatNotices)
        .set(giveUp ? { status: "failed", reason } : { status: "pending", claimedAt: null, reason })
        .where(eq(chatNotices.id, row.id));
      if (giveUp) result.failed++;
      // The chat is likely down: the rest wait for the next run.
      break;
    }
    try {
      await db.update(chatNotices).set({ status: "sent", sentAt: now, reason: null }).where(eq(chatNotices.id, row.id));
      result.sent++;
    } catch (err) {
      logger.error(`[chat-notices] posted ${row.kind} but couldn't record it; left as sending:`, err);
    }
  }
  return result;
}

// ─── 3. Tidy ─────────────────────────────────────────────────────────────────

export async function tidyChatNotices(db: Database, now = new Date()): Promise<{ stuck: number; pruned: number }> {
  const stuck = await db
    .update(chatNotices)
    .set({ status: "failed", reason: "unknown_outcome: the run stopped while posting" })
    .where(and(eq(chatNotices.status, "sending"), lt(chatNotices.claimedAt, new Date(now.getTime() - CHAT_STUCK_MS))))
    .returning({ id: chatNotices.id });
  // 30 days: well past the 24-hour lookback, so nothing is queued again.
  const pruned = await db
    .delete(chatNotices)
    .where(and(inArray(chatNotices.status, ["sent", "skipped", "failed"]), lt(chatNotices.createdAt, new Date(now.getTime() - 30 * DAY_MS))))
    .returning({ id: chatNotices.id });
  return { stuck: stuck.length, pruned: pruned.length };
}

// ─── The cron ────────────────────────────────────────────────────────────────

export type ChatNoticeRun = { configured: false } | ({ configured: true; queued: number; stuck: number; pruned: number } & ChatDispatchResult);

/** Without a poster (no CHAT_BOT_URL) it does nothing: nothing queues up for later either. */
export async function runChatNotices(
  db: Database,
  post: ChatPoster | undefined,
  links: ChatLinks,
  logger: Logger,
  now = new Date(),
): Promise<ChatNoticeRun> {
  if (!post) return { configured: false };
  const tidied = await tidyChatNotices(db, now);
  const queued = await collectChatNotices(db, links, now);
  const sent = await dispatchChatNotices(db, post, logger, now);
  return { configured: true, queued, ...sent, ...tidied };
}
