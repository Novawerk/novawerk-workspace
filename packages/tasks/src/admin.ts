// The members' side of the board (admin panel, `can_admin`): the reads behind the Contributors
// pages, and the writes that aren't a plain transition. Everything here may show what the public
// reads leave out (drafts, hidden posts, decline notes, suspensions), so only /admin calls it.
// Every write on a task records a task event; the notices are built from those, nothing here
// sends mail.

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  TASK_LIMITS,
  TASK_SIZE_WERK,
  formatTaskId,
  type AdminTaskFilter,
  type DiscussionFilter,
  type ProposalEta,
  type ProposalStatus,
  type SuggestionSort,
  type SuggestionWhere,
  type TaskArea,
  type TaskEventKind,
  type TaskKind,
  type TaskSize,
  type TaskStatus,
} from "@nw/contracts";
import {
  contributorModeration,
  members,
  postReports,
  taskEvents,
  taskPosts,
  taskProposals,
  taskVotes,
  tasks,
  werkLedger,
  type Database,
  type Task,
  type TaskPost,
} from "@nw/db";

import { TaskRuleError } from "./errors.js";
import { iso } from "./people.js";
import { idleReleaseAt, idleSince } from "./idle.js";
import { FINAL_STATUSES, IN_PROGRESS_STATUSES } from "./state.js";
import { lockContributor, transitionIn, transitionTask, type Tx } from "./transitions.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** A contributor as members see them. Never the email. */
export interface AdminPerson {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  githubLogin: string | null;
  suspended: boolean;
}

/** One row of the admin task table. */
export interface AdminTaskRow {
  id: string;
  number: number;
  kind: TaskKind;
  title: string;
  summary: string;
  area: TaskArea | null;
  size: TaskSize | null;
  werk: number | null;
  status: TaskStatus;
  needsInfo: boolean;
  /** Pending proposals. */
  proposalCount: number;
  voteCount: number;
  assignee: AdminPerson | null;
  suggestedBy: AdminPerson | null;
  /**
   * Held and quiet long enough for the inactivity reminder (TASK_LIMITS.idleReminderDays after
   * idleSince, the same rule the nightly check uses).
   */
  stale: boolean;
  /** Held tasks: when the nightly check puts it back on the board (14 days, 21 with "a week more"). */
  releaseAt: string | null;
  /** A member should act: a suggestion to triage, or an open task with plans. */
  needsDecision: boolean;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProposal {
  id: string;
  taskId: string;
  taskNumber: number;
  author: AdminPerson;
  approach: string;
  testing: string;
  eta: ProposalEta;
  status: ProposalStatus;
  /** Private to the proposer. */
  declineNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Their record on the board, for "prefer people with nothing in progress". */
  record: { done: number; inProgress: number };
  createdAt: string;
  updatedAt: string;
}

export type AdminAuthor =
  | { kind: "contributor"; person: AdminPerson }
  | { kind: "member"; id: string; name: string }
  | { kind: "former" };

export interface AdminPost {
  id: string;
  taskId: string;
  taskNumber: number;
  taskTitle: string;
  /** The task's thread takes no new posts. */
  threadLocked: boolean;
  parentId: string | null;
  author: AdminAuthor;
  /** Members see the text of hidden posts too. */
  body: string;
  hidden: boolean;
  hiddenReason: string | null;
  hiddenBy: string | null;
  hiddenAt: string | null;
  /** Reports not yet looked at (since a member last kept the post), newest first. Members only. */
  reports: { by: string; reason: string | null; createdAt: string }[];
  createdAt: string;
}

export interface AdminTaskEvent {
  id: number;
  kind: TaskEventKind;
  from: TaskStatus | null;
  to: TaskStatus | null;
  /** A member's name, a contributor's handle, or null for the system. */
  actor: { kind: "member"; name: string } | { kind: "contributor"; handle: string } | null;
  note: string | null;
  prUrl: string | null;
  createdAt: string;
}

export interface AdminTaskDetail extends AdminTaskRow {
  /** A suggestion's screenshot: in the private store until triage (`attached`), then public (`url`). */
  screenshot: { attached: boolean; url: string | null };
  body: string;
  criteria: string[];
  skills: string[];
  repo: string;
  reviewerId: string | null;
  guideTemplate: string | null;
  prUrl: string | null;
  closedReason: string | null;
  duplicateOf: string | null;
  where: SuggestionWhere | null;
  wherePath: string | null;
  wantsIt: boolean;
  threadLocked: boolean;
  /** Withdrawn ones left out. Oldest first. */
  proposals: AdminProposal[];
  /** Oldest first; a reply points at its post (`parentId`). */
  posts: AdminPost[];
  /** Every event, member-only ones too. Oldest first. */
  events: AdminTaskEvent[];
  voters: AdminPerson[];
}

export interface ProposalQueueGroup {
  task: { id: string; number: number; title: string; area: TaskArea | null; size: TaskSize | null; criteria: string[] };
  /** Oldest first. */
  proposals: AdminProposal[];
}

export interface AdminSuggestion {
  id: string;
  number: number;
  kind: TaskKind;
  title: string;
  body: string;
  where: SuggestionWhere | null;
  wherePath: string | null;
  wantsIt: boolean;
  needsInfo: boolean;
  voteCount: number;
  postCount: number;
  suggestedBy: AdminPerson | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContributor extends AdminPerson {
  public: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  suspendedBy: string | null;
  werk: number;
  done: number;
  inProgress: number;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface AdminWerkRow {
  id: number;
  contributor: AdminPerson | null;
  delta: number;
  reason: string;
  task: { id: string; number: number; title: string } | null;
  pr: string | null;
  /** Null: awarded by a merge. */
  byMember: { id: string; name: string } | null;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The account on the contributor side of a row (author, proposer, voter), next to a member's own columns. */
const contributors = alias(members, "contributors");
const assignee = alias(members, "assignee");
const suggester = alias(members, "suggester");

const personCols = (t: typeof contributors | typeof assignee | typeof suggester) => ({
  id: t.id,
  handle: t.handle,
  displayName: t.displayName,
  avatarUrl: t.avatarUrl,
  githubLogin: t.githubLogin,
  suspendedAt: t.suspendedAt,
});

type PersonCols = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  githubLogin: string | null;
  suspendedAt: Date | null;
};

function toPerson(row: PersonCols | null): AdminPerson | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    githubLogin: row.githubLogin,
    suspended: row.suspendedAt !== null,
  };
}

const isoOrNull = (d: Date | null) => (d ? iso(d) : null);

const proposalCount = sql<number>`(select count(*)::int from ${taskProposals} where ${taskProposals.taskId} = ${tasks.id} and ${taskProposals.status} = 'pending')`;
const voteCount = sql<number>`(select count(*)::int from ${taskVotes} where ${taskVotes.taskId} = ${tasks.id})`;
const postCount = sql<number>`(select count(*)::int from ${taskPosts} where ${taskPosts.taskId} = ${tasks.id})`;

function selectTaskRows(db: Database | Tx) {
  return db
    .select({ task: tasks, proposalCount, voteCount, assignee: personCols(assignee), suggester: personCols(suggester) })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(suggester, eq(suggester.id, tasks.suggestedBy));
}

type SelectedTask = Awaited<ReturnType<ReturnType<typeof selectTaskRows>["where"]>>[number];

const isHeld = (task: Pick<Task, "status">) => (IN_PROGRESS_STATUSES as readonly string[]).includes(task.status);

/** Held (assigned or in review) and quiet past the reminder, by idle.ts's clock. */
export function isStale(task: Pick<Task, "status" | "lastActivityAt" | "assignedAt" | "updatedAt">, now: Date): boolean {
  return isHeld(task) && now.getTime() - idleSince(task).getTime() >= TASK_LIMITS.idleReminderDays * DAY_MS;
}

function toRow(r: SelectedTask, now: Date): AdminTaskRow {
  const t = r.task;
  const proposals = Number(r.proposalCount);
  return {
    id: formatTaskId(t.id),
    number: t.id,
    kind: t.kind,
    title: t.title,
    summary: t.summary,
    area: t.area as TaskArea | null,
    size: t.size,
    werk: t.size ? TASK_SIZE_WERK[t.size] : null,
    status: t.status,
    needsInfo: t.needsInfo,
    proposalCount: proposals,
    voteCount: Number(r.voteCount),
    assignee: toPerson(r.assignee as PersonCols | null),
    suggestedBy: toPerson(r.suggester as PersonCols | null),
    stale: isStale(t, now),
    releaseAt: isHeld(t) ? iso(idleReleaseAt(t)) : null,
    needsDecision: t.status === "suggested" || (t.status === "open" && proposals > 0),
    lastActivityAt: isoOrNull(t.lastActivityAt),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

const FILTERS: Record<AdminTaskFilter, (row: AdminTaskRow) => boolean> = {
  all: () => true,
  decide: (r) => r.needsDecision,
  stale: (r) => r.stale,
  draft: (r) => r.status === "draft",
  active: (r) => ["suggested", "open", "assigned", "in_review"].includes(r.status),
  finished: (r) => FINAL_STATUSES.includes(r.status),
};

/** Done and held tasks per contributor, for the proposal cards and the contributor list. */
async function recordsOf(db: Database | Tx, ids: string[]): Promise<Map<string, { done: number; inProgress: number }>> {
  const out = new Map<string, { done: number; inProgress: number }>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: tasks.assigneeId, status: tasks.status, n: count() })
    .from(tasks)
    .where(and(inArray(tasks.assigneeId, ids), inArray(tasks.status, ["done", ...IN_PROGRESS_STATUSES])))
    .groupBy(tasks.assigneeId, tasks.status);
  for (const r of rows) {
    const rec = out.get(r.id!) ?? { done: 0, inProgress: 0 };
    if (r.status === "done") rec.done += r.n;
    else rec.inProgress += r.n;
    out.set(r.id!, rec);
  }
  return out;
}

async function proposalsWhere(db: Database | Tx, where: SQL | undefined): Promise<AdminProposal[]> {
  const rows = await db
    .select({ proposal: taskProposals, author: personCols(contributors) })
    .from(taskProposals)
    .innerJoin(contributors, eq(contributors.id, taskProposals.contributorId))
    .where(where)
    .orderBy(asc(taskProposals.createdAt));
  const records = await recordsOf(db, [...new Set(rows.map((r) => r.proposal.contributorId))]);
  return rows.map(({ proposal: p, author }) => ({
    id: p.id,
    taskId: formatTaskId(p.taskId),
    taskNumber: p.taskId,
    author: toPerson(author)!,
    approach: p.approach,
    testing: p.testing,
    eta: p.eta as ProposalEta,
    status: p.status,
    declineNote: p.declineNote,
    decidedBy: p.decidedBy,
    decidedAt: isoOrNull(p.decidedAt),
    record: records.get(p.contributorId) ?? { done: 0, inProgress: 0 },
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  }));
}

function selectPosts(db: Database | Tx) {
  return db
    .select({
      post: taskPosts,
      taskTitle: tasks.title,
      threadLockedAt: tasks.threadLockedAt,
      author: personCols(contributors),
      memberName: members.displayName,
    })
    .from(taskPosts)
    .innerJoin(tasks, eq(tasks.id, taskPosts.taskId))
    .leftJoin(contributors, eq(contributors.id, taskPosts.authorContributorId))
    .leftJoin(members, eq(members.id, taskPosts.authorMemberId));
}

type SelectedPost = Awaited<ReturnType<ReturnType<typeof selectPosts>["where"]>>[number];

function toAdminPost(r: SelectedPost): AdminPost {
  const p = r.post;
  const person = toPerson(r.author as PersonCols | null);
  const author: AdminAuthor = person
    ? { kind: "contributor", person }
    : p.authorMemberId && r.memberName
      ? { kind: "member", id: p.authorMemberId, name: r.memberName }
      : { kind: "former" };
  return {
    id: p.id,
    taskId: formatTaskId(p.taskId),
    taskNumber: p.taskId,
    taskTitle: r.taskTitle,
    threadLocked: r.threadLockedAt !== null,
    parentId: p.parentId,
    author,
    body: p.body,
    hidden: p.hiddenAt !== null,
    hiddenReason: p.hiddenReason,
    hiddenBy: p.hiddenBy,
    hiddenAt: isoOrNull(p.hiddenAt),
    reports: [],
    createdAt: iso(p.createdAt),
  };
}

/** Attach each post's open reports (newer than its reports_cleared_at). */
async function withReports(db: Database | Tx, posts: AdminPost[]): Promise<AdminPost[]> {
  if (posts.length === 0) return posts;
  const rows = await db
    .select({ postId: postReports.postId, reason: postReports.reason, createdAt: postReports.createdAt, handle: contributors.handle })
    .from(postReports)
    .innerJoin(taskPosts, eq(taskPosts.id, postReports.postId))
    .innerJoin(contributors, eq(contributors.id, postReports.contributorId))
    .where(
      and(
        inArray(postReports.postId, posts.map((p) => p.id)),
        or(isNull(taskPosts.reportsClearedAt), gt(postReports.createdAt, taskPosts.reportsClearedAt)),
      ),
    )
    .orderBy(desc(postReports.createdAt));
  const byPost = new Map<string, AdminPost["reports"]>();
  for (const r of rows) {
    const list = byPost.get(r.postId) ?? [];
    list.push({ by: r.handle, reason: r.reason, createdAt: iso(r.createdAt) });
    byPost.set(r.postId, list);
  }
  return posts.map((p) => ({ ...p, reports: byPost.get(p.id) ?? [] }));
}

async function lockTask(tx: Tx, taskId: number): Promise<Task> {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
  if (!task) throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  return task;
}

async function checkReviewer(db: Database | Tx, reviewerId: string | null | undefined) {
  if (!reviewerId) return;
  const [m] = await db.select({ id: members.id }).from(members).where(eq(members.id, reviewerId));
  if (!m) throw new TaskRuleError("invalid", "Unknown member", "reviewerId");
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The admin task table: every task, drafts and suggestions too, last change first. */
export async function listAdminTasks(db: Database, filter: AdminTaskFilter = "all", now = new Date()): Promise<AdminTaskRow[]> {
  const rows = await selectTaskRows(db).orderBy(desc(tasks.updatedAt), desc(tasks.id));
  return rows.map((r) => toRow(r, now)).filter(FILTERS[filter]);
}

/** One task with everything members may see. */
export async function getAdminTask(db: Database, taskId: number, now = new Date()): Promise<AdminTaskDetail> {
  const [row] = await selectTaskRows(db).where(eq(tasks.id, taskId));
  if (!row) throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  const t = row.task;

  const posts = await selectPosts(db).where(eq(taskPosts.taskId, taskId)).orderBy(asc(taskPosts.createdAt));
  const events = await db
    .select({ event: taskEvents, handle: contributors.handle, memberName: members.displayName })
    .from(taskEvents)
    .leftJoin(contributors, eq(contributors.id, taskEvents.actorContributorId))
    .leftJoin(members, eq(members.id, taskEvents.actorMemberId))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.id));
  const voters = await db
    .select(personCols(contributors))
    .from(taskVotes)
    .innerJoin(contributors, eq(contributors.id, taskVotes.contributorId))
    .where(eq(taskVotes.taskId, taskId))
    .orderBy(asc(taskVotes.createdAt));

  return {
    ...toRow(row, now),
    body: t.body,
    criteria: t.criteria,
    skills: t.skills,
    repo: t.repo,
    reviewerId: t.reviewerId,
    guideTemplate: t.guideTemplate,
    prUrl: t.prUrl,
    closedReason: t.closedReason,
    duplicateOf: t.duplicateOf ? formatTaskId(t.duplicateOf) : null,
    where: t.where as SuggestionWhere | null,
    wherePath: t.wherePath,
    wantsIt: t.wantsIt,
    threadLocked: t.threadLockedAt !== null,
    screenshot: { attached: t.screenshotPathname !== null, url: t.screenshotUrl },
    // Plans that count: withdrawn ones (and anything not sent yet) stay out.
    proposals: (await proposalsWhere(db, eq(taskProposals.taskId, taskId))).filter((p) =>
      (["pending", "chosen", "not_chosen"] as ProposalStatus[]).includes(p.status),
    ),
    posts: await withReports(db, posts.map(toAdminPost)),
    events: events.map(({ event: e, handle, memberName }): AdminTaskEvent => ({
      id: e.id,
      kind: e.kind as TaskEventKind,
      from: e.fromStatus,
      to: e.toStatus,
      actor: memberName ? { kind: "member", name: memberName } : handle ? { kind: "contributor", handle } : null,
      note: e.note,
      prUrl: e.prUrl,
      createdAt: iso(e.createdAt),
    })),
    voters: voters.map((v) => toPerson(v)!),
  };
}

/** Pending plans on open tasks, grouped by task, the longest-waiting task first. */
export async function listProposalQueue(db: Database): Promise<ProposalQueueGroup[]> {
  const open = await db
    .select({ id: tasks.id, title: tasks.title, area: tasks.area, size: tasks.size, criteria: tasks.criteria })
    .from(tasks)
    .where(eq(tasks.status, "open"));
  if (open.length === 0) return [];
  const pending = await proposalsWhere(
    db,
    and(eq(taskProposals.status, "pending"), inArray(taskProposals.taskId, open.map((t) => t.id))),
  );
  const groups = new Map<number, ProposalQueueGroup>();
  for (const p of pending) {
    let group = groups.get(p.taskNumber);
    if (!group) {
      const t = open.find((o) => o.id === p.taskNumber)!;
      group = {
        task: { id: formatTaskId(t.id), number: t.id, title: t.title, area: t.area as TaskArea | null, size: t.size, criteria: t.criteria },
        proposals: [],
      };
      groups.set(p.taskNumber, group);
    }
    group.proposals.push(p);
  }
  // Proposals come oldest first, so the groups are already in the order of each task's oldest plan.
  return [...groups.values()];
}

/** Suggestions waiting for triage: oldest first, or Most wanted (+1s). */
export async function listSuggestions(db: Database, sort: SuggestionSort = "oldest"): Promise<AdminSuggestion[]> {
  const rows = await db
    .select({ task: tasks, voteCount, postCount, suggester: personCols(contributors) })
    .from(tasks)
    .leftJoin(contributors, eq(contributors.id, tasks.suggestedBy))
    .where(eq(tasks.status, "suggested"))
    .orderBy(...(sort === "votes" ? [desc(voteCount), asc(tasks.createdAt)] : [asc(tasks.createdAt)]));
  return rows.map(({ task: t, voteCount: votes, postCount: posts, suggester: s }) => ({
    id: formatTaskId(t.id),
    number: t.id,
    kind: t.kind,
    title: t.title,
    body: t.body,
    where: t.where as SuggestionWhere | null,
    wherePath: t.wherePath,
    wantsIt: t.wantsIt,
    needsInfo: t.needsInfo,
    voteCount: Number(votes),
    postCount: Number(posts),
    suggestedBy: toPerson(s as PersonCols | null),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  }));
}

/**
 * The latest posts across the board (moderation). `reported`: visible posts with reports a member
 * hasn't looked at yet, the most recently reported first. `hidden`: hidden posts.
 */
export async function listDiscussions(db: Database, opts: { filter?: DiscussionFilter; limit?: number } = {}): Promise<AdminPost[]> {
  const filter = opts.filter ?? "all";
  if (filter === "reported") {
    const latest = sql<Date>`max(${postReports.createdAt})`;
    const reported = await db
      .select({ postId: postReports.postId, latest })
      .from(postReports)
      .innerJoin(taskPosts, eq(taskPosts.id, postReports.postId))
      .where(
        and(
          isNull(taskPosts.hiddenAt),
          or(isNull(taskPosts.reportsClearedAt), gt(postReports.createdAt, taskPosts.reportsClearedAt)),
        ),
      )
      .groupBy(postReports.postId)
      .orderBy(desc(latest))
      .limit(opts.limit ?? 200);
    if (reported.length === 0) return [];
    const rows = await selectPosts(db).where(inArray(taskPosts.id, reported.map((r) => r.postId)));
    const order = new Map(reported.map((r, i) => [r.postId, i]));
    const posts = rows.map(toAdminPost).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return withReports(db, posts);
  }
  const rows = await selectPosts(db)
    .where(filter === "hidden" ? isNotNull(taskPosts.hiddenAt) : undefined)
    .orderBy(desc(taskPosts.createdAt))
    .limit(opts.limit ?? 200);
  return withReports(db, rows.map(toAdminPost));
}

/** One post, hidden or not. */
export async function getAdminPost(db: Database, postId: string): Promise<AdminPost> {
  const [row] = await selectPosts(db).where(eq(taskPosts.id, postId));
  if (!row) throw new TaskRuleError("not_found", "No such post");
  const [post] = await withReports(db, [toAdminPost(row)]);
  return post!;
}

/** Every contributor (or one), newest first, with their Werk and record. No email. */
export async function listAdminContributors(db: Database, opts: { id?: string } = {}): Promise<AdminContributor[]> {
  // Spelled out: in a one-table select Drizzle leaves column names unqualified, and "id" would
  // be the ledger's own.
  const werk = sql<number>`(select coalesce(sum(w.delta), 0)::int from werk_ledger w where w.contributor_id = "contributors"."id")`;
  const rows = await db
    .select({ c: contributors, werk })
    .from(contributors)
    .where(opts.id ? eq(contributors.id, opts.id) : undefined)
    .orderBy(desc(contributors.createdAt), asc(contributors.handle));
  const records = await recordsOf(db, rows.map((r) => r.c.id));
  return rows.map(({ c, werk: w }) => ({
    ...toPerson(c)!,
    public: c.public,
    suspendedAt: isoOrNull(c.suspendedAt),
    suspendedReason: c.suspendedReason,
    suspendedBy: c.suspendedBy,
    werk: Number(w),
    ...(records.get(c.id) ?? { done: 0, inProgress: 0 }),
    lastSignInAt: isoOrNull(c.lastSignInAt),
    createdAt: iso(c.createdAt),
  }));
}

/** The Werk ledger (or one row), newest first. */
export async function listWerkLedger(
  db: Database,
  opts: { contributorId?: string; id?: number; limit?: number } = {},
): Promise<AdminWerkRow[]> {
  const rows = await db
    .select({ row: werkLedger, person: personCols(contributors), taskTitle: tasks.title, memberName: members.displayName })
    .from(werkLedger)
    .leftJoin(contributors, eq(contributors.id, werkLedger.contributorId))
    .leftJoin(tasks, eq(tasks.id, werkLedger.taskId))
    .leftJoin(members, eq(members.id, werkLedger.byMemberId))
    .where(
      and(
        opts.contributorId ? eq(werkLedger.contributorId, opts.contributorId) : undefined,
        opts.id !== undefined ? eq(werkLedger.id, opts.id) : undefined,
      ),
    )
    .orderBy(desc(werkLedger.createdAt), desc(werkLedger.id))
    .limit(opts.limit ?? 500);
  return rows.map(({ row: r, person, taskTitle, memberName }) => ({
    id: r.id,
    contributor: toPerson(person as PersonCols | null),
    delta: r.delta,
    reason: r.reason,
    task: r.taskId && taskTitle !== null ? { id: formatTaskId(r.taskId), number: r.taskId, title: taskTitle } : null,
    pr: r.pr,
    byMember: r.byMemberId ? { id: r.byMemberId, name: memberName ?? r.byMemberId } : null,
    createdAt: iso(r.createdAt),
  }));
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type TaskFields = {
  title: string;
  summary: string;
  body: string;
  criteria: string[];
  area: TaskArea;
  size: TaskSize;
  skills: string[];
  repo: string;
  reviewerId: string | null;
  guideTemplate?: string | null;
};

/** A new task, as a draft (or published at once). */
export async function createTask(
  db: Database,
  memberId: string,
  input: TaskFields & { publish?: boolean },
  now = new Date(),
): Promise<Task> {
  const { publish, ...fields } = input;
  await checkReviewer(db, fields.reviewerId);
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        ...fields,
        skills: [...new Set(fields.skills)],
        kind: "task",
        status: "draft",
        createdByMemberId: memberId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(taskEvents).values({ taskId: task!.id, kind: "created", toStatus: "draft", actorMemberId: memberId, createdAt: now });
    if (!publish) return task!;
    return transitionIn(tx, { taskId: task!.id, action: "publish", actor: { kind: "member", id: memberId }, now });
  });
}

/** Edit a task's text and facts. Finished tasks stay as they ended. */
export async function updateTask(
  db: Database,
  memberId: string,
  taskId: number,
  patch: Partial<TaskFields>,
  now = new Date(),
): Promise<Task> {
  await checkReviewer(db, patch.reviewerId);
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (FINAL_STATUSES.includes(task.status)) {
      throw new TaskRuleError("invalid_state", `A task that is ${task.status.replace("_", " ")} can't be edited`);
    }
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<TaskFields>;
    if (changes.skills) changes.skills = [...new Set(changes.skills)];
    const changed = Object.keys(changes).filter(
      (k) => JSON.stringify(changes[k as keyof TaskFields]) !== JSON.stringify(task[k as keyof Task]),
    );
    if (changed.length === 0) return task;
    // Once someone holds it, the deal is set: the size is their Werk, the repo is where they work.
    const frozen = changed.filter((k) => k === "size" || k === "repo");
    if (frozen.length && isHeld(task)) {
      throw new TaskRuleError("invalid_state", "Someone holds this task: its size and repository can't change now", frozen[0]);
    }
    const [updated] = await tx.update(tasks).set({ ...changes, updatedAt: now }).where(eq(tasks.id, taskId)).returning();
    // Members only: which fields changed.
    await tx.insert(taskEvents).values({ taskId, kind: "edited", actorMemberId: memberId, note: changed.join(", "), createdAt: now });
    return updated!;
  });
}

/** A member's post or reply. Locked threads stay open to members. */
async function memberPostIn(tx: Tx, memberId: string, task: Task, body: string, replyTo: string | undefined, now: Date): Promise<TaskPost> {
  if (task.status === "draft") throw new TaskRuleError("invalid_state", "A draft has no thread yet. Publish it first.");
  if (replyTo) {
    const [parent] = await tx.select().from(taskPosts).where(and(eq(taskPosts.id, replyTo), eq(taskPosts.taskId, task.id)));
    if (!parent) throw new TaskRuleError("invalid", "That post isn't on this task", "replyTo");
    if (parent.parentId) throw new TaskRuleError("invalid", "Reply to the post, not to a reply", "replyTo");
  }
  const [post] = await tx
    .insert(taskPosts)
    .values({ taskId: task.id, parentId: replyTo ?? null, authorMemberId: memberId, body: body.trim(), createdAt: now })
    .returning();
  return post!;
}

/** POST /admin/tasks/:id/posts: a member writes in the thread ("ask in the thread"). */
export async function addMemberPost(
  db: Database,
  memberId: string,
  taskId: number,
  input: { body: string; replyTo?: string },
  now = new Date(),
): Promise<TaskPost> {
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, taskId);
    const post = await memberPostIn(tx, memberId, task, input.body, input.replyTo, now);
    await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
    await tx.insert(taskEvents).values({ taskId, kind: "member_posted", actorMemberId: memberId, createdAt: now });
    return post;
  });
}

/** Ask the suggester for more: the question goes into the thread, the suggestion gets "needs info". */
export async function askForInfo(db: Database, memberId: string, taskId: number, question: string, now = new Date()): Promise<Task> {
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (task.status !== "suggested") throw new TaskRuleError("invalid_state", "Only a suggestion can be asked for more info");
    await memberPostIn(tx, memberId, task, question, undefined, now);
    return transitionIn(tx, { taskId, action: "request_info", actor: { kind: "member", id: memberId }, now });
  });
}

/** Turn down one plan with a note only its author reads. The task stays open. */
export async function declineProposal(db: Database, memberId: string, proposalId: string, note: string, now = new Date()): Promise<void> {
  if (!note.trim()) throw new TaskRuleError("invalid", "Write a note: the proposer reads it", "note");
  await db.transaction(async (tx) => {
    // The task first, then the proposal: the order chooseProposal takes them in.
    const [seen] = await tx.select({ taskId: taskProposals.taskId }).from(taskProposals).where(eq(taskProposals.id, proposalId));
    if (!seen) throw new TaskRuleError("not_found", "No such proposal");
    await lockTask(tx, seen.taskId);
    const [proposal] = await tx.select().from(taskProposals).where(eq(taskProposals.id, proposalId)).for("update");
    if (!proposal || proposal.status === "withdrawn") throw new TaskRuleError("not_found", "No such proposal");
    if (proposal.status !== "pending") throw new TaskRuleError("invalid_state", "This proposal isn't pending");
    await tx
      .update(taskProposals)
      .set({ status: "not_chosen", declineNote: note.trim(), decidedBy: memberId, decidedAt: now, updatedAt: now })
      .where(eq(taskProposals.id, proposalId));
    await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, proposal.taskId));
    // Members only: the note is the proposer's, never the timeline's.
    await tx.insert(taskEvents).values({
      taskId: proposal.taskId,
      kind: "proposal_declined",
      actorMemberId: memberId,
      subjectContributorId: proposal.contributorId,
      createdAt: now,
    });
  });
}

/** Accept a suggestion: set what it lacks; open it, or give it to the suggester who asked for it. */
export async function acceptSuggestion(
  db: Database,
  memberId: string,
  taskId: number,
  input: { area: TaskArea; size: TaskSize; criteria: string[]; assignToSuggester?: boolean },
  now = new Date(),
): Promise<Task> {
  return transitionTask(db, {
    taskId,
    action: input.assignToSuggester ? "accept_assign" : "accept",
    actor: { kind: "member", id: memberId },
    accept: { area: input.area, size: input.size, criteria: input.criteria },
    now,
  });
}

/** Hide a post (off-topic, spam, a security report posted by mistake), or show it again. */
export async function setPostHidden(
  db: Database,
  memberId: string,
  postId: string,
  hidden: boolean,
  reason: string,
  now = new Date(),
): Promise<TaskPost> {
  if (!reason.trim()) throw new TaskRuleError("invalid", "Say why", "reason");
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(taskPosts).where(eq(taskPosts.id, postId)).for("update");
    if (!post) throw new TaskRuleError("not_found", "No such post");
    if ((post.hiddenAt !== null) === hidden) {
      throw new TaskRuleError("invalid_state", hidden ? "This post is already hidden" : "This post isn't hidden");
    }
    const [updated] = await tx
      .update(taskPosts)
      // Hiding settles its reports too.
      .set(
        hidden
          ? { hiddenAt: now, hiddenBy: memberId, hiddenReason: reason.trim(), reportsClearedAt: now }
          : { hiddenAt: null, hiddenBy: null, hiddenReason: null },
      )
      .where(eq(taskPosts.id, postId))
      .returning();
    // Members only: the reason stays on the admin side.
    await tx.insert(taskEvents).values({
      taskId: post.taskId,
      kind: hidden ? "post_hidden" : "post_unhidden",
      actorMemberId: memberId,
      subjectContributorId: post.authorContributorId,
      note: reason.trim(),
      createdAt: now,
    });
    return updated!;
  });
}

/** Lock a thread (no new posts from contributors) or open it again. Public: the timeline says so. */
export async function setThreadLocked(
  db: Database,
  memberId: string,
  taskId: number,
  locked: boolean,
  reason: string,
  now = new Date(),
): Promise<Task> {
  if (!reason.trim()) throw new TaskRuleError("invalid", "Say why", "reason");
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, taskId);
    if ((task.threadLockedAt !== null) === locked) {
      throw new TaskRuleError("invalid_state", locked ? "The thread is already locked" : "The thread isn't locked");
    }
    const [updated] = await tx
      .update(tasks)
      .set({ threadLockedAt: locked ? now : null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning();
    await tx.insert(taskEvents).values({
      taskId,
      kind: locked ? "thread_locked" : "thread_unlocked",
      actorMemberId: memberId,
      note: reason.trim(),
      createdAt: now,
    });
    return updated!;
  });
}

/** Keep a reported post as it is: its reports so far leave the Reported queue. */
export async function dismissReports(db: Database, memberId: string, postId: string, reason: string, now = new Date()): Promise<void> {
  if (!reason.trim()) throw new TaskRuleError("invalid", "Say why", "reason");
  await db.transaction(async (tx) => {
    const [post] = await tx.select().from(taskPosts).where(eq(taskPosts.id, postId)).for("update");
    if (!post) throw new TaskRuleError("not_found", "No such post");
    await tx.update(taskPosts).set({ reportsClearedAt: now }).where(eq(taskPosts.id, postId));
    // Members only.
    await tx.insert(taskEvents).values({
      taskId: post.taskId,
      kind: "reports_dismissed",
      actorMemberId: memberId,
      note: reason.trim(),
      createdAt: now,
    });
  });
}

/**
 * Suspend a contributor (they read but don't write, and leave the wall), or lift it. Every
 * change adds a contributor_moderation row (who, why); contributors.suspended_* holds the current
 * one. A suspension also puts their held tasks back on the board (system releases), so a merge
 * can't pay Werk to a suspended account.
 */
export async function setContributorSuspended(
  db: Database,
  memberId: string,
  contributorId: string,
  suspended: boolean,
  reason: string,
  now = new Date(),
): Promise<void> {
  if (!reason.trim()) throw new TaskRuleError("invalid", "Say why", "reason");
  await db.transaction(async (tx) => {
    // Contributor first, then their tasks: the board's lock order.
    const person = await lockContributor(tx, contributorId);
    if (!person) throw new TaskRuleError("not_found", "No such contributor");
    if ((person.suspendedAt !== null) === suspended) {
      throw new TaskRuleError("invalid_state", suspended ? "Already suspended" : "Not suspended");
    }
    await tx
      .update(members)
      .set(
        suspended
          ? { suspendedAt: now, suspendedReason: reason.trim(), suspendedBy: memberId, updatedAt: now }
          : { suspendedAt: null, suspendedReason: null, suspendedBy: null, updatedAt: now },
      )
      .where(eq(members.id, contributorId));
    await tx.insert(contributorModeration).values({
      contributorId,
      action: suspended ? "suspended" : "unsuspended",
      reason: reason.trim(),
      memberId,
      createdAt: now,
    });
    if (!suspended) return;
    const held = await tx
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, contributorId), inArray(tasks.status, [...IN_PROGRESS_STATUSES])));
    for (const t of held) {
      // In review: unlink the pull request first, so a later merge of it finds no task to pay.
      if (t.status === "in_review") {
        await transitionIn(tx, { taskId: t.id, action: "pr_closed", actor: { kind: "system" }, quiet: true, now });
      }
      await transitionIn(tx, {
        taskId: t.id,
        action: "release",
        actor: { kind: "system" },
        // Public and neutral: the timeline doesn't say why, and nobody is mailed.
        note: "Back on the board.",
        quiet: true,
        now,
      });
    }
  });
}

/** Every suspension and lift for one contributor, newest first. Members only. */
export async function moderationHistory(
  db: Database,
  contributorId: string,
): Promise<{ action: "suspended" | "unsuspended"; reason: string; by: string | null; at: string }[]> {
  const rows = await db
    .select({ row: contributorModeration, memberName: members.displayName })
    .from(contributorModeration)
    .leftJoin(members, eq(members.id, contributorModeration.memberId))
    .where(eq(contributorModeration.contributorId, contributorId))
    .orderBy(desc(contributorModeration.createdAt), desc(contributorModeration.id));
  return rows.map(({ row, memberName }) => ({
    action: row.action as "suspended" | "unsuspended",
    reason: row.reason,
    by: memberName ?? row.memberId,
    at: iso(row.createdAt),
  }));
}
