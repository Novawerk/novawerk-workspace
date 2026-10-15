// The contributor task board's data: apps/api's /admin task board routes, or an in-memory sample
// board (fictional people) in sample-data mode. Screens go through ./board-queries.ts.

import {
  TASK_SIZE_WERK,
  TASK_STALE_DAYS,
  formatTaskId,
  parseTaskId,
  type AcceptSuggestionInput,
  type AdminTaskFilter,
  type AdminTaskInput,
  type AdminTaskUpdateInput,
  type DiscussionFilter,
  type SuggestionSort,
  type TaskArea,
  type TaskEventKind,
  type TaskSize,
  type TaskStatus,
  type WerkAdjustInput,
} from "@nw/contracts"

import { ApiError, call } from "./api"
import { client } from "./api-client"
import { USE_SAMPLE_DATA } from "./env"
import { SAMPLE_ME } from "./sample-data"
import type {
  AdminContributor,
  AdminPerson,
  AdminPost,
  AdminProposal,
  AdminSuggestion,
  AdminTaskDetail,
  AdminTaskRow,
  AdminWerkRow,
  ModerationEntry,
  ProposalQueueGroup,
} from "./types"

export interface BoardDataSource {
  listTasks(filter: AdminTaskFilter): Promise<AdminTaskRow[]>
  getTask(id: string): Promise<AdminTaskDetail>
  createTask(input: AdminTaskInput): Promise<AdminTaskDetail>
  updateTask(id: string, patch: AdminTaskUpdateInput): Promise<AdminTaskDetail>
  publishTask(id: string): Promise<AdminTaskDetail>
  closeTask(id: string, reason: string): Promise<AdminTaskDetail>
  reopenTask(id: string, reason: string): Promise<AdminTaskDetail>
  postOnTask(id: string, body: string, replyTo?: string): Promise<AdminTaskDetail>

  proposalQueue(): Promise<ProposalQueueGroup[]>
  chooseProposal(id: string, notes: Record<string, string>): Promise<AdminTaskDetail>
  declineProposal(id: string, note: string): Promise<AdminTaskDetail>

  listSuggestions(sort: SuggestionSort): Promise<AdminSuggestion[]>
  acceptSuggestion(id: string, input: AcceptSuggestionInput): Promise<AdminTaskDetail>
  markDuplicate(id: string, of: string): Promise<AdminTaskDetail>
  askForInfo(id: string, question: string): Promise<AdminTaskDetail>
  declineSuggestion(id: string, note: string): Promise<AdminTaskDetail>

  listDiscussions(filter: DiscussionFilter): Promise<AdminPost[]>
  setPostHidden(id: string, hidden: boolean, reason: string): Promise<AdminPost>
  keepPost(id: string, reason: string): Promise<AdminPost>
  setThreadLocked(id: string, locked: boolean, reason: string): Promise<AdminTaskDetail>
  listContributors(): Promise<AdminContributor[]>
  setSuspended(id: string, suspended: boolean, reason: string): Promise<AdminContributor>
  moderationHistory(id: string): Promise<ModerationEntry[]>

  listWerk(contributorId?: string): Promise<AdminWerkRow[]>
  adjustWerk(input: WerkAdjustInput): Promise<AdminWerkRow>
}

const admin = client.admin

const liveSource: BoardDataSource = {
  listTasks: (filter) => call(admin.tasks.$get({ query: { filter } })),
  getTask: (id) => call(admin.tasks[":id"].$get({ param: { id } })),
  createTask: (input) => call(admin.tasks.$post({ json: input })),
  updateTask: (id, patch) => call(admin.tasks[":id"].$patch({ param: { id }, json: patch })),
  publishTask: (id) => call(admin.tasks[":id"].publish.$post({ param: { id } })),
  closeTask: (id, reason) => call(admin.tasks[":id"].close.$post({ param: { id }, json: { reason } })),
  reopenTask: (id, reason) => call(admin.tasks[":id"].reopen.$post({ param: { id }, json: { reason } })),
  postOnTask: (id, body, replyTo) =>
    call(admin.tasks[":id"].posts.$post({ param: { id }, json: replyTo ? { body, replyTo } : { body } })),

  proposalQueue: () => call(admin.proposals.$get()),
  chooseProposal: (id, notes) => call(admin.proposals[":id"].choose.$post({ param: { id }, json: { notes } })),
  declineProposal: (id, note) => call(admin.proposals[":id"].decline.$post({ param: { id }, json: { note } })),

  listSuggestions: (sort) => call(admin.suggestions.$get({ query: { sort } })),
  acceptSuggestion: (id, input) => call(admin.suggestions[":id"].accept.$post({ param: { id }, json: input })),
  markDuplicate: (id, of) => call(admin.suggestions[":id"].duplicate.$post({ param: { id }, json: { of } })),
  askForInfo: (id, question) => call(admin.suggestions[":id"].ask.$post({ param: { id }, json: { question } })),
  declineSuggestion: (id, note) => call(admin.suggestions[":id"].decline.$post({ param: { id }, json: { note } })),

  listDiscussions: (filter) => call(admin.discussions.$get({ query: { filter } })),
  setPostHidden: (id, hidden, reason) =>
    call(
      hidden
        ? admin.discussions[":id"].hide.$post({ param: { id }, json: { reason } })
        : admin.discussions[":id"].unhide.$post({ param: { id }, json: { reason } }),
    ),
  keepPost: (id, reason) => call(admin.discussions[":id"].keep.$post({ param: { id }, json: { reason } })),
  setThreadLocked: (id, locked, reason) =>
    call(
      locked
        ? admin.tasks[":id"].lock.$post({ param: { id }, json: { reason } })
        : admin.tasks[":id"].unlock.$post({ param: { id }, json: { reason } }),
    ),
  listContributors: () => call(admin.contributors.$get()),
  setSuspended: (id, suspended, reason) =>
    call(
      suspended
        ? admin.contributors[":id"].suspend.$post({ param: { id }, json: { reason } })
        : admin.contributors[":id"].unsuspend.$post({ param: { id }, json: { reason } }),
    ),

  moderationHistory: (id) => call(admin.contributors[":id"].moderation.$get({ param: { id } })),
  listWerk: (contributorId) => call(admin.werk.$get({ query: contributorId ? { contributor: contributorId } : {} })),
  adjustWerk: (input) => call(admin.werk.$post({ json: input })),
}

// ─── Sample board (in memory, resets on reload; fictional people) ────────────

const DAY = 86_400_000
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString()
const delay = (ms = 200) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const nowIso = () => new Date().toISOString()

function refuse(message: string, field?: string, status = 400): never {
  throw new ApiError(status, { error: message, ...(field ? { issues: { [field]: [message] } } : {}) })
}

const person = (id: string, handle: string, displayName: string, suspended = false): AdminPerson => ({
  id,
  handle,
  displayName,
  avatarUrl: null,
  githubLogin: handle,
  suspended,
})

const PEOPLE = {
  lena: person("c-lena", "lena-k", "Lena K."),
  tomas: person("c-tomas", "tomas-r", "Tomás R."),
  ines: person("c-ines", "ines-m", "Inès M."),
  kai: person("c-kai", "kai-builds", "Kai"),
  spam: person("c-spam", "cheap-watches-99", "Watch Deals", true),
}

type SampleTask = Omit<AdminTaskDetail, "id" | "werk" | "stale" | "releaseAt" | "needsDecision" | "proposalCount">

let nextPost = 1
let nextProposal = 1
let nextEvent = 1
let nextWerk = 1

const ev = (kind: TaskEventKind, at: string, from: TaskStatus | null, to: TaskStatus | null, note: string | null = null) => ({
  id: nextEvent++,
  kind,
  from,
  to,
  actor: { kind: "member" as const, name: SAMPLE_ME.displayName },
  note,
  prUrl: null,
  createdAt: at,
})

function proposal(taskNumber: number, author: AdminPerson, approach: string, at: string, over: Partial<AdminProposal> = {}): AdminProposal {
  return {
    id: `p-${nextProposal++}`,
    taskId: formatTaskId(taskNumber),
    taskNumber,
    author,
    approach,
    testing: "A unit test, and I'll check it by hand on a phone.",
    eta: "week",
    status: "pending",
    declineNote: null,
    decidedBy: null,
    decidedAt: null,
    record: { done: 0, inProgress: 0 },
    createdAt: at,
    updatedAt: at,
    ...over,
  }
}

function post(task: { number: number; title: string }, author: AdminPost["author"], body: string, at: string, over: Partial<AdminPost> = {}): AdminPost {
  return {
    id: `post-${nextPost++}`,
    taskId: formatTaskId(task.number),
    taskNumber: task.number,
    taskTitle: task.title,
    threadLocked: false,
    parentId: null,
    author,
    body,
    hidden: false,
    hiddenReason: null,
    hiddenBy: null,
    hiddenAt: null,
    reports: [],
    createdAt: at,
    ...over,
  }
}

function task(number: number, over: Partial<SampleTask>): SampleTask {
  const createdAt = over.createdAt ?? ago(20)
  // Like the API: a member's task was created as a draft and published; a suggestion was suggested.
  const events =
    over.kind && over.kind !== "task"
      ? [{ ...ev("suggested", createdAt, null, "suggested"), actor: over.suggestedBy ? { kind: "contributor" as const, handle: over.suggestedBy.handle } : null }]
      : over.status === "draft"
        ? [ev("created", createdAt, null, "draft")]
        : [ev("created", createdAt, null, "draft"), ev("published", createdAt, "draft", "open")]
  return {
    events,
    number,
    kind: "task",
    title: "",
    summary: "",
    area: "web",
    size: "M",
    status: "open",
    needsInfo: false,
    voteCount: 0,
    assignee: null,
    suggestedBy: null,
    lastActivityAt: null,
    createdAt,
    updatedAt: createdAt,
    body: "",
    criteria: [],
    skills: [],
    repo: "Novawerk/novawerk-workspace",
    reviewerId: null,
    guideTemplate: null,
    prUrl: null,
    closedReason: null,
    duplicateOf: null,
    where: null,
    wherePath: null,
    wantsIt: false,
    threadLocked: false,
    screenshot: { attached: false, url: null },
    proposals: [],
    posts: [],
    voters: [],
    ...over,
  }
}

function seed(): Map<number, SampleTask> {
  const t1 = task(1, {
    title: "Skeleton rows on the task list",
    summary: "Show grey rows while /tasks loads, instead of a blank page.",
    area: "web",
    size: "S",
    skills: ["react", "tailwind"],
    body: "## What\nWhile `/tasks` loads, the list is empty for a second. Show six skeleton rows.\n\n## Why\nIt looks broken on slow phones.",
    criteria: ["Six skeleton rows while loading", "No layout shift when the rows arrive"],
    reviewerId: "mara",
    createdAt: ago(12),
    updatedAt: ago(1),
  })
  t1.proposals = [
    proposal(1, PEOPLE.lena, "Reuse the Skeleton from packages/ui in a `TaskListSkeleton`, shown by the Suspense boundary.", ago(3)),
    proposal(1, PEOPLE.tomas, "Add a loading.tsx next to the page with fixed-height rows.", ago(1), {
      eta: "days",
      record: { done: 2, inProgress: 0 },
    }),
  ]
  t1.events = [ev("created", ago(12), null, "draft"), ev("published", ago(12), "draft", "open")]

  const t2 = task(2, {
    title: "Rate limit on the email sign-in",
    summary: "A database-backed per-IP limit on /auth/contributor/email/start.",
    area: "api",
    size: "L",
    skills: ["hono", "postgres"],
    criteria: ["10 requests per IP per hour across instances", "A test with two app instances"],
    status: "assigned",
    assignee: PEOPLE.kai,
    lastActivityAt: ago(9),
    createdAt: ago(25),
    updatedAt: ago(9),
  })
  t2.events = [ev("created", ago(25), null, "draft"), ev("published", ago(25), "draft", "open"), ev("assigned", ago(16), "open", "assigned")]

  const t3 = task(3, {
    title: "Dark mode for the newsletter archive",
    area: "web",
    size: "M",
    status: "in_review",
    assignee: PEOPLE.ines,
    prUrl: "https://github.com/Novawerk/novawerk-workspace/pull/0",
    lastActivityAt: ago(1),
    criteria: ["Reads well in dark mode", "Screenshots in the PR"],
    createdAt: ago(30),
    updatedAt: ago(1),
  })
  const t4 = task(4, {
    title: "Document the agent runner flags",
    summary: "A section in agents/README.md for --input, --dry-run and --help.",
    area: "docs",
    size: "S",
    status: "draft",
    createdAt: ago(2),
    updatedAt: ago(2),
  })
  t4.events = [ev("created", ago(2), null, "draft")]
  const t5 = task(5, {
    title: "Sort the contributor wall A–Z",
    kind: "improvement",
    status: "suggested",
    area: null,
    size: null,
    suggestedBy: PEOPLE.lena,
    wantsIt: true,
    where: "site",
    wherePath: "/contributors",
    body: "The wall is getting long. An A–Z sort would help me find people I worked with.",
    voteCount: 4,
    voters: [PEOPLE.tomas, PEOPLE.ines, PEOPLE.kai, PEOPLE.spam],
    createdAt: ago(6),
    updatedAt: ago(6),
  })
  const t6 = task(6, {
    title: "Task links break in the newsletter email",
    kind: "bug",
    status: "suggested",
    area: null,
    size: null,
    suggestedBy: PEOPLE.tomas,
    where: "api",
    body: "What happened: the NW-12 link in the October issue goes to a 404.\nWhat I expected: the task page.\nSteps: open the email, click the first task.",
    voteCount: 1,
    voters: [PEOPLE.lena],
    needsInfo: true,
    createdAt: ago(9),
    updatedAt: ago(3),
  })
  t6.posts = [post(t6, { kind: "member", id: "mara", name: "Mara Lindqvist" }, "Which mail client was that? We see it work in Gmail.", ago(3))]
  const t7 = task(7, {
    title: "Retire the old intake form",
    area: "web",
    size: "S",
    status: "closed",
    closedReason: "Done as part of the site rebuild.",
    createdAt: ago(40),
    updatedAt: ago(15),
  })
  t1.posts = [
    post(t1, { kind: "contributor", person: PEOPLE.lena }, "Should the skeleton match the card layout on phones too?", ago(2)),
    post(t1, { kind: "contributor", person: PEOPLE.kai }, "Honestly this whole site is slow, why bother with skeletons.", ago(1, 8), {
      reports: [{ by: PEOPLE.ines.handle, reason: "Not about this task", createdAt: ago(1, 6) }],
    }),
    post(t1, { kind: "contributor", person: PEOPLE.spam }, "Best watches, 90% off, link in bio", ago(1, 4), {
      hidden: true,
      hiddenReason: "Spam",
      hiddenBy: SAMPLE_ME.id,
      hiddenAt: ago(1, 2),
    }),
  ]
  return new Map([t1, t2, t3, t4, t5, t6, t7].map((t) => [t.number, t]))
}

const tasks = seed()

const ledger: AdminWerkRow[] = [
  {
    id: nextWerk++,
    contributor: PEOPLE.tomas,
    delta: 3,
    reason: "Merged NW-8: Footer links",
    task: null,
    pr: "https://github.com/Novawerk/novawerk-workspace/pull/0",
    byMember: null,
    createdAt: ago(18),
  },
  {
    id: nextWerk++,
    contributor: PEOPLE.tomas,
    delta: 1,
    reason: "Merged NW-9: Typo on /about",
    task: null,
    pr: "https://github.com/Novawerk/novawerk-workspace/pull/0",
    byMember: null,
    createdAt: ago(11),
  },
]

const suspension = new Map<string, { at: string; reason: string; by: string }>([
  [PEOPLE.spam.id, { at: ago(1, 2), reason: "Spam on NW-1", by: SAMPLE_ME.id }],
])

function isStale(t: SampleTask) {
  if (t.status !== "assigned" && t.status !== "in_review") return false
  return t.lastActivityAt !== null && Date.now() - Date.parse(t.lastActivityAt) >= TASK_STALE_DAYS * DAY
}

function detail(t: SampleTask): AdminTaskDetail {
  const proposalCount = t.proposals.filter((p) => p.status === "pending").length
  return structuredClone({
    ...t,
    id: formatTaskId(t.number),
    werk: t.size ? TASK_SIZE_WERK[t.size] : null,
    proposalCount,
    stale: isStale(t),
    releaseAt: t.status === "assigned" || t.status === "in_review" ? new Date(Date.parse(t.lastActivityAt ?? t.createdAt) + 14 * DAY).toISOString() : null,
    needsDecision: t.status === "suggested" || (t.status === "open" && proposalCount > 0),
  })
}

function row(t: SampleTask): AdminTaskRow {
  const d = detail(t)
  return {
    id: d.id,
    number: d.number,
    kind: d.kind,
    title: d.title,
    summary: d.summary,
    area: d.area,
    size: d.size,
    werk: d.werk,
    status: d.status,
    needsInfo: d.needsInfo,
    proposalCount: d.proposalCount,
    voteCount: d.voteCount,
    assignee: d.assignee,
    suggestedBy: d.suggestedBy,
    stale: d.stale,
    releaseAt: d.releaseAt,
    needsDecision: d.needsDecision,
    lastActivityAt: d.lastActivityAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

function find(id: string): SampleTask {
  const n = parseTaskId(id)
  const t = n === null ? undefined : tasks.get(n)
  if (!t) refuse(`${id} doesn't exist`, undefined, 404)
  return t
}

const FINAL: TaskStatus[] = ["done", "closed", "declined", "duplicate"]
const FILTERS: Record<AdminTaskFilter, (r: AdminTaskRow) => boolean> = {
  all: () => true,
  decide: (r) => r.needsDecision,
  stale: (r) => r.stale,
  draft: (r) => r.status === "draft",
  active: (r) => ["suggested", "open", "assigned", "in_review"].includes(r.status),
  finished: (r) => FINAL.includes(r.status),
}

function move(t: SampleTask, from: TaskStatus[], to: TaskStatus, kind: TaskEventKind, note: string | null = null) {
  if (!from.includes(t.status)) refuse(`A task that is ${t.status.replace("_", " ")} can't be changed that way`, undefined, 409)
  const at = nowIso()
  t.events.push(ev(kind, at, t.status, to, note))
  t.status = to
  t.updatedAt = at
}

const allPosts = () =>
  [...tasks.values()].flatMap((t) => t.posts).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

function contributorsList(): AdminContributor[] {
  const all = Object.values(PEOPLE)
  return all.map((p, i) => {
    const s = suspension.get(p.id)
    const held = [...tasks.values()].filter((t) => t.assignee?.id === p.id)
    return {
      ...p,
      suspended: Boolean(s),
      public: p.id !== PEOPLE.spam.id,
      suspendedAt: s?.at ?? null,
      suspendedReason: s?.reason ?? null,
      suspendedBy: s?.by ?? null,
      werk: ledger.filter((r) => r.contributor?.id === p.id).reduce((n, r) => n + r.delta, 0),
      done: held.filter((t) => t.status === "done").length + (p.id === PEOPLE.tomas.id ? 2 : 0),
      inProgress: held.filter((t) => t.status === "assigned" || t.status === "in_review").length,
      lastSignInAt: ago(i, 3),
      createdAt: ago(60 - i * 9),
    }
  })
}

const sampleSource: BoardDataSource = {
  listTasks: async (filter) => {
    await delay()
    return [...tasks.values()]
      .map(row)
      .filter(FILTERS[filter])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  getTask: async (id) => {
    await delay(120)
    return detail(find(id))
  },
  createTask: async (input) => {
    await delay()
    if (!input.title || input.title.trim().length < 3) refuse("Give it a short title", "title")
    const number = Math.max(...tasks.keys()) + 1
    const at = nowIso()
    const t = task(number, {
      title: input.title.trim(),
      summary: input.summary ?? "",
      body: input.body ?? "",
      criteria: input.criteria ?? [],
      area: input.area,
      size: input.size,
      skills: input.skills ?? [],
      repo: input.repo ?? "Novawerk/novawerk-workspace",
      reviewerId: input.reviewerId ?? null,
      guideTemplate: input.guideTemplate ?? null,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      events: [ev("created", at, null, "draft")],
    })
    tasks.set(number, t)
    if (input.publish) move(t, ["draft"], "open", "published")
    return detail(t)
  },
  updateTask: async (id, patch) => {
    await delay()
    const t = find(id)
    if (FINAL.includes(t.status)) refuse(`A task that is ${t.status} can't be edited`, undefined, 409)
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<SampleTask>
    Object.assign(t, clean, { updatedAt: nowIso() })
    t.events.push(ev("edited", nowIso(), null, null, Object.keys(clean).join(", ")))
    return detail(t)
  },
  publishTask: async (id) => {
    await delay()
    const t = find(id)
    move(t, ["draft"], "open", "published")
    return detail(t)
  },
  closeTask: async (id, reason) => {
    await delay()
    const t = find(id)
    move(t, ["open", "assigned", "in_review"], "closed", "closed", reason)
    t.closedReason = reason
    return detail(t)
  },
  reopenTask: async (id, reason) => {
    await delay()
    const t = find(id)
    move(t, ["closed"], "open", "reopened", reason)
    Object.assign(t, { closedReason: null, assignee: null, prUrl: null, lastActivityAt: null })
    return detail(t)
  },
  postOnTask: async (id, body, replyTo) => {
    await delay()
    const t = find(id)
    if (t.status === "draft") refuse("A draft has no thread yet. Publish it first.", undefined, 409)
    t.posts.push(post(t, { kind: "member", id: SAMPLE_ME.id, name: SAMPLE_ME.displayName }, body, nowIso(), { parentId: replyTo ?? null }))
    t.events.push(ev("member_posted", nowIso(), null, null))
    return detail(t)
  },

  proposalQueue: async () => {
    await delay()
    return [...tasks.values()]
      .filter((t) => t.status === "open" && t.proposals.some((p) => p.status === "pending"))
      .map((t) => ({
        task: { id: formatTaskId(t.number), number: t.number, title: t.title, area: t.area, size: t.size, criteria: t.criteria },
        proposals: structuredClone(t.proposals.filter((p) => p.status === "pending")),
      }))
      .sort((a, b) => a.proposals[0]!.createdAt.localeCompare(b.proposals[0]!.createdAt))
  },
  chooseProposal: async (id, notes) => {
    await delay()
    const t = [...tasks.values()].find((x) => x.proposals.some((p) => p.id === id)) ?? refuse("No such proposal", undefined, 404)
    const chosen = t.proposals.find((p) => p.id === id)!
    if (chosen.status !== "pending") refuse("This proposal isn't pending", undefined, 409)
    move(t, ["open"], "assigned", "assigned")
    const at = nowIso()
    for (const p of t.proposals.filter((x) => x.status === "pending")) {
      Object.assign(
        p,
        p.id === id
          ? { status: "chosen", decidedBy: SAMPLE_ME.id, decidedAt: at }
          : { status: "not_chosen", declineNote: notes[p.id] || "Thanks for the plan. We picked another one this time.", decidedBy: SAMPLE_ME.id, decidedAt: at },
      )
    }
    Object.assign(t, { assignee: chosen.author, lastActivityAt: at })
    return detail(t)
  },
  declineProposal: async (id, note) => {
    await delay()
    if (!note.trim()) refuse("Note: please write something", "note")
    const t = [...tasks.values()].find((x) => x.proposals.some((p) => p.id === id)) ?? refuse("No such proposal", undefined, 404)
    const p = t.proposals.find((x) => x.id === id)!
    Object.assign(p, { status: "not_chosen", declineNote: note, decidedBy: SAMPLE_ME.id, decidedAt: nowIso() })
    t.events.push(ev("proposal_declined", nowIso(), null, null))
    return detail(t)
  },

  listSuggestions: async (sort) => {
    await delay()
    const list = [...tasks.values()].filter((t) => t.status === "suggested")
    list.sort((a, b) => (sort === "votes" ? b.voteCount - a.voteCount : 0) || a.createdAt.localeCompare(b.createdAt))
    return list.map((t) => ({
      id: formatTaskId(t.number),
      number: t.number,
      kind: t.kind,
      title: t.title,
      body: t.body,
      where: t.where,
      wherePath: t.wherePath,
      wantsIt: t.wantsIt,
      needsInfo: t.needsInfo,
      voteCount: t.voteCount,
      postCount: t.posts.length,
      suggestedBy: t.suggestedBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  },
  acceptSuggestion: async (id, input) => {
    await delay()
    const t = find(id)
    if (!input.criteria?.length) refuse("Add at least one done-when line", "criteria")
    if (input.assignToSuggester && !t.wantsIt) refuse("Only the person who suggested it, and asked to do it, can get it directly")
    move(t, ["suggested"], input.assignToSuggester ? "assigned" : "open", "accepted")
    Object.assign(t, {
      area: input.area as TaskArea,
      size: input.size as TaskSize,
      criteria: input.criteria,
      needsInfo: false,
      ...(input.assignToSuggester ? { assignee: t.suggestedBy, lastActivityAt: nowIso() } : {}),
    })
    return detail(t)
  },
  markDuplicate: async (id, of) => {
    await delay()
    const t = find(id)
    const original = parseTaskId(of)
    if (original === null || !tasks.has(original) || original === t.number) refuse("A task id like NW-12", "of")
    move(t, ["suggested"], "duplicate", "duplicate")
    t.duplicateOf = formatTaskId(original)
    return detail(t)
  },
  askForInfo: async (id, question) => {
    await delay()
    const t = find(id)
    if (t.status !== "suggested") refuse("Only a suggestion can be asked for more info", undefined, 409)
    t.posts.push(post(t, { kind: "member", id: SAMPLE_ME.id, name: SAMPLE_ME.displayName }, question, nowIso()))
    move(t, ["suggested"], "suggested", "info_requested")
    t.needsInfo = true
    return detail(t)
  },
  declineSuggestion: async (id, note) => {
    await delay()
    const t = find(id)
    move(t, ["suggested"], "declined", "declined", note)
    t.closedReason = note
    return detail(t)
  },

  listDiscussions: async (filter) => {
    await delay()
    return structuredClone(allPosts()).filter((p) =>
      filter === "hidden" ? p.hidden : filter === "reported" ? !p.hidden && p.reports.length > 0 : true,
    )
  },
  setThreadLocked: async (id, locked, reason) => {
    await delay()
    const t = find(id)
    if (t.threadLocked === locked) refuse(locked ? "The thread is already locked" : "The thread isn't locked", undefined, 409)
    t.threadLocked = locked
    for (const p of t.posts) p.threadLocked = locked
    t.events.push(ev(locked ? "thread_locked" : "thread_unlocked", nowIso(), null, null, reason))
    return detail(t)
  },
  keepPost: async (id, reason) => {
    await delay()
    const p = allPosts().find((x) => x.id === id) ?? refuse("No such post", undefined, 404)
    p.reports = []
    tasks.get(p.taskNumber)?.events.push(ev("reports_dismissed", nowIso(), null, null, reason))
    return { ...p }
  },
  setPostHidden: async (id, hidden, reason) => {
    await delay()
    const p = allPosts().find((x) => x.id === id) ?? refuse("No such post", undefined, 404)
    if (p.hidden === hidden) refuse(hidden ? "This post is already hidden" : "This post isn't hidden", undefined, 409)
    Object.assign(
      p,
      hidden
        ? { hidden, hiddenReason: reason, hiddenBy: SAMPLE_ME.id, hiddenAt: nowIso(), reports: [] }
        : { hidden, hiddenReason: null, hiddenBy: null, hiddenAt: null },
    )
    tasks.get(p.taskNumber)?.events.push(ev(hidden ? "post_hidden" : "post_unhidden", nowIso(), null, null, reason))
    return { ...p }
  },
  listContributors: async () => {
    await delay()
    return contributorsList()
  },
  setSuspended: async (id, suspended, reason) => {
    await delay()
    if (suspension.has(id) === suspended) refuse(suspended ? "Already suspended" : "Not suspended", undefined, 409)
    if (suspended) suspension.set(id, { at: nowIso(), reason, by: SAMPLE_ME.id })
    else suspension.delete(id)
    return contributorsList().find((c) => c.id === id) ?? refuse("No such contributor", undefined, 404)
  },

  moderationHistory: async (id) => {
    await delay()
    const s = suspension.get(id)
    return s ? [{ action: "suspended" as const, reason: s.reason, by: SAMPLE_ME.displayName, at: s.at }] : []
  },
  listWerk: async (contributorId) => {
    await delay()
    return ledger.filter((r) => !contributorId || r.contributor?.id === contributorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  adjustWerk: async (input) => {
    await delay()
    const who = Object.values(PEOPLE).find((p) => p.id === input.contributorId) ?? refuse("Pick a contributor", "contributorId")
    if (!input.reason.trim()) refuse("Reason: please write something", "reason")
    if (!Number.isInteger(input.delta) || input.delta === 0) refuse("Not zero", "delta")
    const n = input.taskId ? parseTaskId(input.taskId) : null
    const t = n === null ? undefined : tasks.get(n)
    if (input.taskId && !t) refuse("A task id like NW-12", "taskId")
    const entry: AdminWerkRow = {
      id: nextWerk++,
      contributor: who,
      delta: input.delta,
      reason: input.reason.trim(),
      task: t ? { id: formatTaskId(t.number), number: t.number, title: t.title } : null,
      pr: null,
      byMember: { id: SAMPLE_ME.id, name: SAMPLE_ME.displayName },
      createdAt: nowIso(),
    }
    ledger.push(entry)
    return entry
  },
}

export const boardSource: BoardDataSource = USE_SAMPLE_DATA ? sampleSource : liveSource
