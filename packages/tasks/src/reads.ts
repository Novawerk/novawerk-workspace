// The public reads: the board, one task, the contributors wall and a profile. No session needed,
// so nothing here may depend on who asks: drafts, hidden posts' text, decline notes, withdrawn
// proposals, private profiles and every email stay out.

import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  PUBLIC_TASK_STATUSES,
  TASK_SIZE_WERK,
  formatTaskId,
  parseTaskId,
  type ContributorListQuery,
  type MyProposal,
  type ProfileAccent,
  type ProfileBanner,
  type ProposalEta,
  type PublicContributor,
  type PublicContributorProfile,
  type PublicPost,
  type PublicProposal,
  type PublicTask,
  type PublicTaskDetail,
  type PublicTaskEvent,
  type PublicTaskPage,
  type PublicTaskRef,
  type PublicTaskStatus,
  type SuggestionWhere,
  type TaskArea,
  type TaskEventKind,
  type TaskListQuery,
  type TaskStatus,
  type TaskStatusFilter,
} from "@nw/contracts";
import {
  contributorTokens,
  contributors,
  members,
  taskEvents,
  taskPosts,
  taskProposals,
  taskVotes,
  tasks,
  werkLedger,
  type Database,
  type TaskProposal,
} from "@nw/db";

import { TaskRuleError } from "./errors.js";
import { authorOf, contributorPerson, iso, type PersonRow } from "./people.js";

const STATUS_FILTERS: Record<Exclude<TaskStatusFilter, "proposals">, readonly PublicTaskStatus[]> = {
  active: ["suggested", "open", "assigned", "in_review"],
  suggested: ["suggested"],
  open: ["open"],
  in_progress: ["assigned"],
  in_review: ["in_review"],
  done: ["done"],
  closed: ["closed", "declined", "duplicate"],
  all: PUBLIC_TASK_STATUSES,
};

const assignee = alias(contributors, "assignee");
const suggester = alias(contributors, "suggester");

const person = (t: typeof contributors | typeof assignee | typeof suggester) => ({
  handle: t.handle,
  displayName: t.displayName,
  avatarUrl: t.avatarUrl,
  public: t.public,
});

const proposalCount = sql<number>`(select count(*)::int from ${taskProposals} where ${taskProposals.taskId} = ${tasks.id} and ${taskProposals.status} = 'pending')`;
const postCount = sql<number>`(select count(*)::int from ${taskPosts} where ${taskPosts.taskId} = ${tasks.id} and ${taskPosts.hiddenAt} is null)`;
const voteCount = sql<number>`(select count(*)::int from ${taskVotes} where ${taskVotes.taskId} = ${tasks.id})`;

function selectTasks(db: Database) {
  return db
    .select({
      task: tasks,
      proposalCount,
      postCount,
      voteCount,
      /** Postgres' own text of updated_at (microseconds), for the cursor. */
      updatedKey: sql<string>`${tasks.updatedAt}::text`,
      assignee: person(assignee),
      suggester: person(suggester),
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(suggester, eq(suggester.id, tasks.suggestedBy));
}

type TaskRow = Awaited<ReturnType<ReturnType<typeof selectTasks>["where"]>>[number];

function toPublicTask(row: TaskRow): PublicTask {
  const t = row.task;
  return {
    id: formatTaskId(t.id),
    number: t.id,
    kind: t.kind,
    title: t.title,
    summary: t.summary,
    area: t.area as TaskArea | null,
    size: t.size,
    werk: t.size ? TASK_SIZE_WERK[t.size] : null,
    skills: t.skills,
    status: t.status as PublicTaskStatus,
    proposalCount: Number(row.proposalCount),
    postCount: Number(row.postCount),
    voteCount: Number(row.voteCount),
    assignee: row.assignee ? contributorPerson(row.assignee as PersonRow) : t.status === "assigned" || t.status === "in_review" ? { kind: "former" } : null,
    suggestedBy: row.suggester ? contributorPerson(row.suggester as PersonRow) : t.kind !== "task" ? { kind: "former" } : null,
    where: t.where as SuggestionWhere | null,
    needsInfo: t.needsInfo,
    prUrl: t.prUrl,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

// ─── Cursor: [sort key, task id] as base64url JSON ───────────────────────────

const encodeCursor = (key: string | number, id: number) => Buffer.from(JSON.stringify([key, id])).toString("base64url");

function decodeCursor(cursor: string, sort: TaskListQuery["sort"]): [string | number, number] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && Number.isInteger(value[1])) {
      const [key, id] = value as [unknown, number];
      if (sort === "votes" && Number.isInteger(key)) return [key as number, id];
      if (sort === "updated" && typeof key === "string" && !Number.isNaN(Date.parse(key))) return [key, id];
    }
  } catch {
    // reported below
  }
  throw new TaskRuleError("invalid", "That page link has expired. Start from the first page.", "cursor");
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** GET /public/tasks: filters, then the last change first (or the most +1s), 30 at a time. */
export async function listPublicTasks(db: Database, query: TaskListQuery): Promise<PublicTaskPage> {
  const where: SQL[] = [];
  if (query.status === "proposals") {
    where.push(eq(tasks.status, "open"), sql`${proposalCount} > 0`);
  } else {
    where.push(inArray(tasks.status, [...STATUS_FILTERS[query.status]]));
  }
  if (query.area?.length) where.push(inArray(tasks.area, query.area));
  if (query.size?.length) where.push(inArray(tasks.size, query.size));
  if (query.skills?.length) where.push(sql`${tasks.skills} && ${sql.param(query.skills)}::text[]`);
  if (query.q) {
    const n = parseTaskId(query.q);
    const like = `%${likeEscape(query.q)}%`;
    where.push(or(ilike(tasks.title, like), ilike(tasks.summary, like), ...(n ? [eq(tasks.id, n)] : []))!);
  }
  if (query.cursor) {
    const [key, id] = decodeCursor(query.cursor, query.sort);
    where.push(
      query.sort === "votes"
        ? sql`(${voteCount}, ${tasks.id}) < (${key}, ${id})`
        : sql`(${tasks.updatedAt}, ${tasks.id}) < (${key}::timestamptz, ${id})`,
    );
  }
  const order = query.sort === "votes" ? [desc(voteCount), desc(tasks.id)] : [desc(tasks.updatedAt), desc(tasks.id)];
  const rows = await selectTasks(db)
    .where(and(...where))
    .orderBy(...order)
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const more = rows.length > query.limit && last;
  return {
    tasks: page.map(toPublicTask),
    nextCursor: more ? encodeCursor(query.sort === "votes" ? Number(last.voteCount) : last.updatedKey, last.task.id) : null,
  };
}

export const toPublicProposal = (p: TaskProposal, author: PersonRow | null): PublicProposal => ({
  id: p.id,
  author: author ? contributorPerson(author) : { kind: "former" },
  approach: p.approach,
  testing: p.testing,
  eta: p.eta as ProposalEta,
  status: p.status as PublicProposal["status"],
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
});

/** GET /public/tasks/:id: the task, its proposals, the thread, the timeline and who +1'd. */
export async function getPublicTask(db: Database, taskId: number): Promise<PublicTaskDetail | null> {
  const [row] = await selectTasks(db).where(and(eq(tasks.id, taskId), inArray(tasks.status, [...PUBLIC_TASK_STATUSES])));
  if (!row) return null;
  const t = row.task;

  const proposals = await db
    .select({ proposal: taskProposals, author: person(contributors) })
    .from(taskProposals)
    .leftJoin(contributors, eq(contributors.id, taskProposals.contributorId))
    .where(and(eq(taskProposals.taskId, taskId), inArray(taskProposals.status, ["pending", "chosen", "not_chosen"])))
    .orderBy(asc(taskProposals.createdAt));

  const posts = await db
    .select({
      post: taskPosts,
      contributor: person(contributors),
      memberName: members.displayName,
      tokenName: contributorTokens.name,
    })
    .from(taskPosts)
    .leftJoin(contributors, eq(contributors.id, taskPosts.authorContributorId))
    .leftJoin(members, eq(members.id, taskPosts.authorMemberId))
    .leftJoin(contributorTokens, eq(contributorTokens.id, taskPosts.viaTokenId))
    .where(eq(taskPosts.taskId, taskId))
    .orderBy(asc(taskPosts.createdAt), asc(taskPosts.id));

  const toPost = (r: (typeof posts)[number]): PublicPost =>
    r.post.hiddenAt
      ? { id: r.post.id, author: null, body: null, hidden: true, viaAgent: null, createdAt: iso(r.post.createdAt), replies: [] }
      : {
          id: r.post.id,
          author: authorOf(r.contributor as PersonRow | null, r.memberName),
          body: r.post.body,
          hidden: false,
          viaAgent: r.tokenName,
          createdAt: iso(r.post.createdAt),
          replies: [],
        };
  const thread: PublicPost[] = [];
  const byId = new Map<string, PublicPost>();
  for (const r of posts.filter((p) => !p.post.parentId)) {
    const post = toPost(r);
    byId.set(post.id, post);
    thread.push(post);
  }
  for (const r of posts.filter((p) => p.post.parentId)) byId.get(r.post.parentId!)?.replies.push(toPost(r));

  const events = await db
    .select({ event: taskEvents, contributor: person(contributors), memberName: members.displayName })
    .from(taskEvents)
    .leftJoin(contributors, eq(contributors.id, taskEvents.actorContributorId))
    .leftJoin(members, eq(members.id, taskEvents.actorMemberId))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.id));

  const voters = await db
    .select(person(contributors))
    .from(taskVotes)
    .innerJoin(contributors, eq(contributors.id, taskVotes.contributorId))
    .where(eq(taskVotes.taskId, taskId))
    .orderBy(asc(taskVotes.createdAt));

  return {
    ...toPublicTask(row),
    body: t.body,
    criteria: t.criteria,
    repo: t.repo,
    wherePath: t.wherePath,
    wantsIt: t.wantsIt,
    closedReason: t.closedReason,
    duplicateOf: t.duplicateOf ? formatTaskId(t.duplicateOf) : null,
    threadLocked: t.threadLockedAt !== null,
    proposals: proposals.map((p) => toPublicProposal(p.proposal, p.author as PersonRow | null)),
    posts: thread,
    events: events.map(
      (e): PublicTaskEvent => ({
        kind: e.event.kind as TaskEventKind,
        from: publicStatus(e.event.fromStatus),
        to: publicStatus(e.event.toStatus),
        actor: authorOf(e.contributor as PersonRow | null, e.memberName, false),
        note: e.event.note,
        prUrl: e.event.prUrl,
        createdAt: iso(e.event.createdAt),
      }),
    ),
    voters: voters.map((v) => contributorPerson(v)),
  };
}

/** A draft step on the timeline (draft → open) shows as a task that was created. */
const publicStatus = (s: TaskStatus | null): PublicTaskStatus | null => (s === null || s === "draft" ? null : s);

/** GET /contrib/me/proposals: your own proposals, with the private note when one wasn't chosen. */
export async function myProposals(db: Database, contributorId: string): Promise<MyProposal[]> {
  const rows = await db
    .select({ proposal: taskProposals, author: person(contributors), title: tasks.title })
    .from(taskProposals)
    .innerJoin(tasks, eq(tasks.id, taskProposals.taskId))
    .innerJoin(contributors, eq(contributors.id, taskProposals.contributorId))
    .where(eq(taskProposals.contributorId, contributorId))
    .orderBy(desc(taskProposals.createdAt));
  return rows.map(({ proposal, author, title }) => ({
    ...toPublicProposal(proposal, author),
    status: proposal.status === "withdrawn" ? "pending" : (proposal.status as PublicProposal["status"]),
    withdrawn: proposal.status === "withdrawn",
    taskId: formatTaskId(proposal.taskId),
    taskTitle: title,
    declineNote: proposal.declineNote,
  }));
}

// ─── Contributors ────────────────────────────────────────────────────────────

/** Merged tasks and accepted ideas of these contributors. */
async function contributionsOf(db: Database, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      area: tasks.area,
      size: tasks.size,
      status: tasks.status,
      assigneeId: tasks.assigneeId,
      suggestedBy: tasks.suggestedBy,
      doneAt: tasks.doneAt,
      acceptedAt: tasks.acceptedAt,
    })
    .from(tasks)
    .where(
      or(
        and(inArray(tasks.assigneeId, ids), inArray(tasks.status, ["assigned", "in_review", "done"])),
        and(inArray(tasks.suggestedBy, ids), isNotNull(tasks.acceptedAt)),
      ),
    )
    .orderBy(desc(tasks.doneAt), desc(tasks.id));
}

const refOf = (t: { id: number; title: string; area: string | null; size: keyof typeof TASK_SIZE_WERK | null }): PublicTaskRef => ({
  id: formatTaskId(t.id),
  title: t.title,
  area: t.area as TaskArea | null,
  werk: t.size ? TASK_SIZE_WERK[t.size] : null,
});

/**
 * GET /public/contributors: public profiles on the wall with at least one merged task or an
 * accepted idea. Newest contribution first, or A–Z. Never ordered by Werk.
 */
export async function listPublicContributors(db: Database, query: ContributorListQuery): Promise<PublicContributor[]> {
  const people = await db
    .select({ id: contributors.id, handle: contributors.handle, name: contributors.displayName, avatarUrl: contributors.avatarUrl, bio: contributors.bio })
    .from(contributors)
    .where(and(eq(contributors.public, true), eq(contributors.onWall, true)));
  const work = await contributionsOf(db, people.map((p) => p.id));

  const cards: PublicContributor[] = [];
  for (const p of people) {
    const merged = work.filter((t) => t.assigneeId === p.id && t.status === "done" && t.doneAt);
    const ideas = work.filter((t) => t.suggestedBy === p.id && t.acceptedAt);
    if (!merged.length && !ideas.length) continue;
    const areas = [...new Set(merged.map((t) => t.area).filter((a): a is string => a !== null))] as TaskArea[];
    if (query.area && !areas.includes(query.area)) continue;
    const dates = [...merged.map((t) => t.doneAt!), ...ideas.map((t) => t.acceptedAt!)];
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    cards.push({ handle: p.handle, name: p.name, avatarUrl: p.avatarUrl, bio: p.bio, areas, lastContributionAt: iso(latest), idea: ideas.length > 0 });
  }
  return query.sort === "az"
    ? cards.sort((a, b) => a.handle.localeCompare(b.handle))
    : cards.sort((a, b) => b.lastContributionAt.localeCompare(a.lastContributionAt) || a.handle.localeCompare(b.handle));
}

/** GET /public/contributors/:handle: only a public profile. A private one is "not found". */
export async function getPublicContributor(db: Database, handle: string): Promise<PublicContributorProfile | null> {
  const [c] = await db
    .select()
    .from(contributors)
    .where(and(eq(contributors.handle, handle.toLowerCase()), eq(contributors.public, true)))
    .limit(1);
  if (!c) return null;
  const work = await contributionsOf(db, [c.id]);
  const [werk] = await db
    .select({ total: sql<number>`coalesce(sum(${werkLedger.delta}), 0)::int` })
    .from(werkLedger)
    .where(eq(werkLedger.contributorId, c.id));
  const done = work.filter((t) => t.assigneeId === c.id && t.status === "done");
  const inProgress = work.filter((t) => t.assigneeId === c.id && t.status !== "done");
  const ideas = work.filter((t) => t.suggestedBy === c.id && t.acceptedAt);
  return {
    handle: c.handle,
    name: c.displayName,
    avatarUrl: c.avatarUrl,
    bio: c.bio,
    about: c.about,
    links: c.links,
    accent: c.accent as ProfileAccent,
    banner: c.banner as ProfileBanner,
    githubLogin: c.githubLogin,
    since: iso(c.createdAt),
    stats: { done: done.length, inProgress: inProgress.length, werk: Number(werk?.total ?? 0) },
    inProgress: inProgress.map(refOf),
    done: done.map((t) => ({ ...refOf(t), mergedAt: t.doneAt ? iso(t.doneAt) : null })),
    ideasAccepted: ideas.map(refOf),
  };
}
