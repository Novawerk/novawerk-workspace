// The public reads: the board, one task, the contributors wall and a profile. No session needed,
// so nothing here may depend on who asks: drafts, hidden posts' text, decline notes, withdrawn
// proposals, private profiles and every email stay out.

import { createHmac } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  HANDLE_PATTERN,
  INITIATOR_ROLE,
  MEMBER_ONLY_EVENT_KINDS,
  PUBLIC_TASK_STATUSES,
  TASK_SIZE_WERK,
  formatTaskId,
  parseTaskId,
  type ContributorListQuery,
  type MyProposal,
  type MyTasks,
  type PublicBlock,
  type ProfileAccent,
  type ProfileBanner,
  type ProposalEta,
  type PublicContributor,
  type PublicContributorPage,
  type PublicInitiator,
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
  PUBLIC_PROJECT_STATUSES,
  contributorTokens,
  members,
  projectMembers,
  projectSubmissions,
  projects,
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

/** The account on the contributor side of a row (author, proposer, voter), next to a member's own columns. */
const contributors = alias(members, "contributors");
const assignee = alias(members, "assignee");
const suggester = alias(members, "suggester");

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
    // Held or merged work always had someone: without a row now, they deleted their account.
    assignee: row.assignee
      ? contributorPerson(row.assignee as PersonRow)
      : t.status === "assigned" || t.status === "in_review" || t.status === "done"
        ? { kind: "former" }
        : null,
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

/** Postgres' text of a timestamptz, e.g. `2026-10-15 07:02:14.123456+00`, with a real date and time. */
const PG_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?([+-])(\d{2})(?::(\d{2}))?(?::\d{2})?$/;
function isPgTimestamp(text: string): boolean {
  const m = PG_TIMESTAMP.exec(text);
  if (!m) return false;
  const [y, mo, d, h, mi, sec, , oh, om] = m.slice(1).map((v) => (v === undefined ? 0 : Number(v)));
  const day = new Date(Date.UTC(y!, mo! - 1, d!));
  return (
    y! >= 1 && day.getUTCFullYear() === y && day.getUTCMonth() === mo! - 1 && day.getUTCDate() === d &&
    h! <= 23 && mi! <= 59 && sec! <= 59 && oh! <= 15 && om! <= 59
  );
}
const MAX_INT = 2_147_483_647;
const isRowId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_INT;

function decodeCursor(cursor: string, sort: TaskListQuery["sort"]): [string | number, number] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && isRowId(value[1])) {
      const [key, id] = value as [unknown, number];
      if (sort === "votes" && Number.isInteger(key) && (key as number) >= 0 && (key as number) <= MAX_INT) return [key as number, id];
      if (sort === "updated" && typeof key === "string" && isPgTimestamp(key)) {
        return [key, id];
      }
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

export const toPublicProposal = (p: TaskProposal, author: PersonRow | null, viaAgent: string | null = null): PublicProposal => ({
  id: p.id,
  author: author ? contributorPerson(author) : { kind: "former" },
  approach: p.approach,
  testing: p.testing,
  eta: p.eta as ProposalEta,
  status: p.status as PublicProposal["status"],
  viaAgent,
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
});

/** GET /public/tasks/:id: the task, its proposals, the thread, the timeline and who +1'd. */
export async function getPublicTask(db: Database, taskId: number): Promise<PublicTaskDetail | null> {
  const [row] = await selectTasks(db).where(and(eq(tasks.id, taskId), inArray(tasks.status, [...PUBLIC_TASK_STATUSES])));
  if (!row) return null;
  const t = row.task;

  const proposals = await db
    .select({ proposal: taskProposals, author: person(contributors), tokenName: contributorTokens.name })
    .from(taskProposals)
    .leftJoin(contributors, eq(contributors.id, taskProposals.contributorId))
    .leftJoin(contributorTokens, eq(contributorTokens.id, taskProposals.viaTokenId))
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
    .select({ event: taskEvents, contributor: person(contributors), memberName: members.displayName, tokenName: contributorTokens.name })
    .from(taskEvents)
    .leftJoin(contributors, eq(contributors.id, taskEvents.actorContributorId))
    .leftJoin(members, eq(members.id, taskEvents.actorMemberId))
    .leftJoin(contributorTokens, eq(contributorTokens.id, taskEvents.viaTokenId))
    .where(and(eq(taskEvents.taskId, taskId), notInArray(taskEvents.kind, [...MEMBER_ONLY_EVENT_KINDS])))
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
    screenshotUrl: t.screenshotUrl,
    proposals: proposals.map((p) => toPublicProposal(p.proposal, p.author as PersonRow | null, p.tokenName)),
    posts: thread,
    events: events.map(
      (e): PublicTaskEvent => ({
        kind: e.event.kind as TaskEventKind,
        from: publicStatus(e.event.fromStatus),
        to: publicStatus(e.event.toStatus),
        actor: authorOf(e.contributor as PersonRow | null, e.memberName, false),
        note: e.event.note,
        prUrl: e.event.prUrl,
        viaAgent: e.tokenName,
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
    .select({ proposal: taskProposals, author: person(contributors), title: tasks.title, tokenName: contributorTokens.name })
    .from(taskProposals)
    .innerJoin(tasks, eq(tasks.id, taskProposals.taskId))
    .innerJoin(contributors, eq(contributors.id, taskProposals.contributorId))
    .leftJoin(contributorTokens, eq(contributorTokens.id, taskProposals.viaTokenId))
    .where(eq(taskProposals.contributorId, contributorId))
    .orderBy(desc(taskProposals.createdAt));
  return rows.map(({ proposal, author, title, tokenName }) => ({
    ...toPublicProposal(proposal, author, tokenName),
    status: proposal.status === "withdrawn" || proposal.status === "draft" ? "pending" : (proposal.status as PublicProposal["status"]),
    withdrawn: proposal.status === "withdrawn",
    draft: proposal.status === "draft",
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

/** Public projects (the portfolio statuses) a member started: their role is "Initiator". */
const initiatedProjects = (memberIds: string[]) =>
  memberIds.length
    ? sql`select ${projectMembers.memberId} as member_id, ${projects.slug} as slug, ${projects.title} as title, ${projects.createdAt} as created_at
          from ${projectMembers} join ${projects} on ${projects.id} = ${projectMembers.projectId}
          where lower(trim(${projectMembers.role})) = ${INITIATOR_ROLE.toLowerCase()}
            and ${projects.status} in (${sql.join(PUBLIC_PROJECT_STATUSES.map((st) => sql`${st}`), sql`, `)})
            and ${projectMembers.memberId} in (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})
          order by ${projects.createdAt} desc`
    : null;

type InitiatedRow = { member_id: string; slug: string; title: string; created_at: Date | string };

async function projectsStartedBy(db: Database, memberIds: string[]): Promise<InitiatedRow[]> {
  const query = initiatedProjects(memberIds);
  return query ? rowsOf<InitiatedRow>(await db.execute(query)) : [];
}


/** Rows of a raw query: node-postgres and PGlite both answer `{ rows }`. */
const rowsOf = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

/**
 * The wall's cursor: A–Z is `[handle]`, newest is `[last, handle]`. Handles are unique across
 * contributors and members (one namespace), so no internal id ever goes into a link.
 */
function decodeWallCursor(cursor: string, sort: ContributorListQuery["sort"]): [string] | [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const handleOk = (h: unknown): h is string => typeof h === "string" && h.length <= 40 && HANDLE_PATTERN.test(h);
    if (sort === "az" && Array.isArray(value) && value.length === 1 && handleOk(value[0])) return [value[0]];
    if (sort === "newest" && Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && isPgTimestamp(value[0]) && handleOk(value[1])) {
      return [value[0], value[1]];
    }
  } catch {
    // reported below
  }
  throw new TaskRuleError("invalid", "That page link has expired. Start from the first page.", "cursor");
}

type WallRow = {
  kind: "contributor" | "initiator";
  id: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  last: Date | string;
  last_key: string;
};

/**
 * GET /public/contributors: one wall of
 * - contributors: public, on the wall, not suspended, with a merged task or an accepted idea;
 * - initiators: anyone else public and on the wall who started a public project (NB-ADR-0013).
 * Newest contribution (or project) first, or A–Z, a page at a time. Never ordered by Werk. An
 * area filter shows contributors only: initiators have no areas.
 */
export async function listPublicContributors(db: Database, query: ContributorListQuery): Promise<PublicContributorPage> {
  const statuses = sql.join(PUBLIC_PROJECT_STATUSES.map((st) => sql`${st}`), sql`, `);
  const contributorRows = sql`
    select 'contributor' as kind, c.id as id, c.profile_handle as handle, c.display_name as name, c.avatar_url, c.profile_bio as bio,
      greatest(
        (select max(t.done_at) from tasks t where t.assignee_id = c.id and t.status = 'done'),
        (select max(t.accepted_at) from tasks t where t.suggested_by = c.id)
      ) as last
    from members c
    where c.public_profile and c.on_wall and c.suspended_at is null and c.active
      ${query.area ? sql`and exists (select 1 from tasks t where t.assignee_id = c.id and t.status = 'done' and t.area = ${query.area})` : sql``}`;
  const initiatorRows = sql`
    select 'initiator' as kind, m.id as id, m.profile_handle as handle, m.display_name as name, m.avatar_url, m.profile_bio as bio,
      (select max(p.created_at) from project_members pm join projects p on p.id = pm.project_id
        where pm.member_id = m.id and lower(trim(pm.role)) = ${INITIATOR_ROLE.toLowerCase()} and p.status in (${statuses})) as last
    from members m
    where m.public_profile and m.on_wall and m.suspended_at is null and m.active
      -- One card each: someone with merged work or an accepted idea stands there as a contributor.
      and not exists (select 1 from tasks t where (t.assignee_id = m.id and t.status = 'done') or (t.suggested_by = m.id and t.accepted_at is not null))`;
  const union = query.area ? contributorRows : sql`${contributorRows} union all ${initiatorRows}`;

  let after = sql``;
  if (query.cursor) {
    const decoded = decodeWallCursor(query.cursor, query.sort);
    after =
      decoded.length === 1
        ? sql`and w.handle > ${decoded[0]}`
        : sql`and (w.last, w.handle) < (${decoded[0]}::timestamptz, ${decoded[1]})`;
  }
  const order = query.sort === "az" ? sql`w.handle asc` : sql`w.last desc, w.handle desc`;
  const rows = rowsOf<WallRow>(
    await db.execute(sql`
      select w.*, w.last::text as last_key from (${union}) w
      where w.last is not null ${after}
      order by ${order}
      limit ${query.limit + 1}`),
  );

  const page = rows.slice(0, query.limit);
  const people = page.filter((r) => r.kind === "contributor").map((r) => r.id);
  const work = await contributionsOf(db, people);
  const started = await projectsStartedBy(db, page.filter((r) => r.kind === "initiator").map((r) => r.id));
  const cards = page.map((p): PublicContributor => {
    const merged = work.filter((t) => t.assigneeId === p.id && t.status === "done");
    const project = p.kind === "initiator" ? started.find((s) => s.member_id === p.id) : undefined;
    return {
      kind: p.kind,
      handle: p.handle,
      name: p.name,
      avatarUrl: p.avatar_url,
      bio: p.bio,
      areas: [...new Set(merged.map((t) => t.area).filter((a): a is string => a !== null))] as TaskArea[],
      lastContributionAt: iso(p.last),
      idea: work.some((t) => t.suggestedBy === p.id && t.acceptedAt),
      project: project ? { slug: project.slug, title: project.title } : null,
    };
  });
  const last = page[page.length - 1];
  return {
    contributors: cards,
    nextCursor:
      rows.length > query.limit && last
        ? Buffer.from(JSON.stringify(query.sort === "az" ? [last.handle] : [last.last_key, last.handle])).toString("base64url")
        : null,
  };
}

/** GET /public/initiators: Members with a public profile, one row per public project they started. */
export async function listPublicInitiators(db: Database): Promise<PublicInitiator[]> {
  const people = await db
    .select({ id: members.id, handle: members.handle, name: members.displayName })
    .from(members)
    .where(and(eq(members.public, true), eq(members.active, true), isNull(members.suspendedAt)));
  const started = await projectsStartedBy(db, people.map((p) => p.id));
  return started.map((s) => {
    const who = people.find((p) => p.id === s.member_id)!;
    return { handle: who.handle!, name: who.name, project: { slug: s.slug, title: s.title }, startedAt: iso(s.created_at) };
  });
}

/**
 * GET /public/contributors/:handle: a public profile, with the public projects they started
 * (kind "initiator" when that is all they have done so far). Anything private is "not found".
 */
export async function getPublicContributor(db: Database, handle: string): Promise<PublicContributorProfile | null> {
  const wanted = handle.toLowerCase();
  const [c] = await db
    .select()
    .from(members)
    .where(and(eq(members.handle, wanted), eq(members.public, true), eq(members.active, true), isNull(members.suspendedAt)))
    .limit(1);
  if (!c) return null;
  const work = await contributionsOf(db, [c.id]);
  const started = await projectsStartedBy(db, [c.id]);
  const [werk] = await db
    .select({ total: sql<number>`coalesce(sum(${werkLedger.delta}), 0)::int` })
    .from(werkLedger)
    .where(eq(werkLedger.contributorId, c.id));
  const done = work.filter((t) => t.assigneeId === c.id && t.status === "done");
  const inProgress = work.filter((t) => t.assigneeId === c.id && t.status !== "done");
  const ideas = work.filter((t) => t.suggestedBy === c.id && t.acceptedAt);
  return {
    // Someone who started a project and hasn't worked on the board yet stands as its initiator.
    kind: started.length && !work.length && c.githubId === null ? "initiator" : "contributor",
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
    projects: started.map((s) => ({ slug: s.slug, title: s.title })),
  };
}

// ─── Blocks and my tasks ─────────────────────────────────────────────────────

/**
 * A stable, opaque key for someone whose profile isn't public (or who left): the same person is
 * the same key on every visit, and the key can't be turned back into a handle without `anonKey`.
 */
export const anonymousKey = (anonKey: string, seed: string) => `anon-${createHmac("sha256", anonKey).update(seed).digest("hex").slice(0, 8)}`;

/**
 * GET /public/blocks: every merged task and every accepted idea, oldest first, for the builders
 * scene. As on the wall, a person is named only with a public profile and an active account;
 * anyone else is an unnamed figure with a stable key (the design: "people without a public
 * profile appear as unnamed figures"). Tasks themselves still show a private person's handle,
 * unlinked (people.ts).
 *
 * Ideas: a suggestion a maintainer accepted is laid at `acceptedAt` and credited to whoever
 * suggested it. A project pitch (any not declined) is laid when it was sent; once it became a
 * project, it is credited to the project's initiator. A pitch shows nothing it was written with:
 * only the project's name, once the project is public.
 */
export async function listPublicBlocks(db: Database, anonKey: string): Promise<PublicBlock[]> {
  type Who = { id: string; handle: string | null; public: boolean; suspendedAt: Date | null } | null;
  const handleOf = (who: Who, seed: string) =>
    who?.public && !who.suspendedAt && who.handle ? who.handle : anonymousKey(anonKey, who ? `contributor:${who.id}` : seed);
  const person = { id: assignee.id, handle: assignee.handle, public: assignee.public, suspendedAt: assignee.suspendedAt };

  const merged = await db
    .select({ task: tasks, who: person })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .where(and(eq(tasks.status, "done"), isNotNull(tasks.doneAt)))
    .orderBy(asc(tasks.doneAt), asc(tasks.id));
  const out: PublicBlock[] = merged.map(({ task, who }) => ({
    kind: "task",
    id: formatTaskId(task.id),
    task: formatTaskId(task.id),
    title: task.title,
    area: task.area as TaskArea | null,
    size: task.size,
    handle: handleOf(who, `task:${task.id}`),
    mergedAt: iso(task.doneAt!),
  }));

  const suggested = await db
    .select({ task: tasks, who: { id: suggester.id, handle: suggester.handle, public: suggester.public, suspendedAt: suggester.suspendedAt } })
    .from(tasks)
    .leftJoin(suggester, eq(suggester.id, tasks.suggestedBy))
    .where(and(isNotNull(tasks.suggestedBy), isNotNull(tasks.acceptedAt)))
    .orderBy(asc(tasks.acceptedAt), asc(tasks.id));
  const ideas: PublicBlock[] = suggested.map(({ task, who }) => ({
    kind: "idea",
    id: `idea-${formatTaskId(task.id)}`,
    task: formatTaskId(task.id),
    title: task.title,
    area: task.area as TaskArea | null,
    size: "S",
    handle: handleOf(who, `suggestion:${task.id}`),
    mergedAt: iso(task.acceptedAt!),
  }));

  // Pitches not declined, with the project each became (the first, if several) and its initiator.
  const pitches = await db
    .select({
      id: projectSubmissions.id,
      createdAt: projectSubmissions.createdAt,
      project: { id: projects.id, title: projects.title, status: projects.status, createdAt: projects.createdAt },
    })
    .from(projectSubmissions)
    .leftJoin(projects, eq(projects.submissionId, projectSubmissions.id))
    .where(ne(projectSubmissions.status, "declined"))
    .orderBy(asc(projectSubmissions.id), asc(projects.createdAt));
  const projectIds = pitches.flatMap((p) => (p.project ? [p.project.id] : []));
  const leads = projectIds.length
    ? await db
        .select({ projectId: projectMembers.projectId, who: person })
        .from(projectMembers)
        .innerJoin(assignee, eq(assignee.id, projectMembers.memberId))
        .where(and(inArray(projectMembers.projectId, projectIds), sql`lower(trim(${projectMembers.role})) = ${INITIATOR_ROLE.toLowerCase()}`))
        .orderBy(asc(projectMembers.memberId))
    : [];
  const seen = new Set<string>();
  for (const p of pitches) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const lead = p.project ? (leads.find((l) => l.projectId === p.project!.id)?.who ?? null) : null;
    const isPublic = !!p.project && (PUBLIC_PROJECT_STATUSES as readonly string[]).includes(p.project.status);
    ideas.push({
      kind: "idea",
      id: `idea-p${createHmac("sha256", anonKey).update(`submission:${p.id}`).digest("hex").slice(0, 8)}`,
      task: null,
      title: isPublic ? p.project!.title : "A project pitch",
      area: null,
      size: "M",
      handle: handleOf(lead, `submission:${p.id}`),
      mergedAt: iso(p.createdAt),
    });
  }

  // Oldest first. The sort is stable, so ties keep tasks before ideas and each list's own order.
  const at = (b: PublicBlock) => Date.parse(b.mergedAt);
  return [...out, ...ideas].sort((a, b) => at(a) - at(b));
}

/** GET /contrib/me/tasks: what I hold (in progress or in review) and my pending proposals. */
export async function myTasks(db: Database, contributorId: string): Promise<MyTasks> {
  const held = await selectTasks(db)
    .where(and(eq(tasks.assigneeId, contributorId), inArray(tasks.status, ["assigned", "in_review"])))
    .orderBy(desc(tasks.updatedAt));
  // Pending ones, and agents' drafts waiting for a confirm.
  const proposals = (await myProposals(db, contributorId)).filter((p) => p.status === "pending" && !p.withdrawn);
  return { held: held.map(toPublicTask), proposals };
}

/** GET /contrib/me/votes: the suggestions I +1'd, as "NW-42". */
export async function myVotes(db: Database, contributorId: string): Promise<string[]> {
  const rows = await db
    .select({ taskId: taskVotes.taskId })
    .from(taskVotes)
    .where(eq(taskVotes.contributorId, contributorId))
    .orderBy(asc(taskVotes.taskId));
  return rows.map((r) => formatTaskId(r.taskId));
}
