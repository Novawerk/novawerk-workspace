// One interface, two implementations: apps/api through the typed Hono client, and an in-memory
// sample store. Screens never call fetch directly; they go through the hooks in ./queries.ts.

import {
  APPLICATION_STATUSES,
  SUBMISSION_STATUSES,
  placeholdersIn,
  xiaohongshuLinks,
  toHandle,
  isReservedHandle,
  memberSelfUpdateInput,
  type DocumentUploadInput,
  type ImageUploadInput,
} from "@nw/contracts"

import { ApiError, call, callText } from "./api"
import { SAMPLE_CONTRIBUTOR_HANDLES } from "./board-source"
import { client } from "./api-client"
import { API_URL, USE_SAMPLE_DATA } from "./env"
import {
  SAMPLE_APPLICATIONS,
  SAMPLE_DOCUMENTS,
  SAMPLE_FINANCE,
  SAMPLE_ME,
  SAMPLE_MEMBERS,
  SAMPLE_OUTBOX,
  SAMPLE_DELIVERABLES,
  SAMPLE_HISTORY,
  SAMPLE_PARTNERS,
  SAMPLE_POSTS,
  SAMPLE_PROJECTS,
  SAMPLE_SUBMISSIONS,
  SAMPLE_SUBSCRIBERS,
  SAMPLE_TRANSCRIPTS,
  sampleMetrics,
} from "./sample-data"
import type {
  AcceptedApplication,
  AdminMetrics,
  AcceptedSubmission,
  ApplicationAcceptInput,
  ApplicationPatch,
  ApplicationStatus,
  CardRenderInput,
  Deliverable,
  DeliverableInput,
  DeliverablePatch,
  DeclinedSubmission,
  DocumentCreateInput,
  DocumentRow,
  FinanceEntry,
  FinanceEntryInput,
  IntakeTranscript,
  InviteDraft,
  InviteDraftInput,
  Me,
  Member,
  MemberApplication,
  MemberCreateInput,
  MemberSelfUpdateInput,
  MemberPatch,
  OutboxApproveResult,
  OutboxDraftInput,
  OutboxEmail,
  OutboxFilter,
  OutboxPatch,
  Partner,
  PartnerInput,
  PartnerPatch,
  Post,
  PostBoard,
  PostCreateInput,
  PostCreated,
  PostDraftRequested,
  PostExportLink,
  PostFilter,
  PostPatch,
  Project,
  ProjectBoard,
  ProjectFile,
  ProjectFileCreateInput,
  ProjectFileUploadInput,
  ProjectInput,
  ProjectPatch,
  ProjectSaved,
  ProjectSubmission,
  ProjectTeam,
  StatusChange,
  Subscriber,
  SubmissionAcceptInput,
  SubmissionDeclineInput,
  SubmissionPatch,
  SubmissionStatus,
  TeamMember,
  UploadTicket,
  WebsiteRefresh,
} from "./types"

export interface AdminDataSource {
  readonly isSample: boolean
  me(): Promise<Me>
  signInWithGoogle(credential: string): Promise<void>
  /** Local development only — see DEV_LOGIN in ./env. */
  signInDev(email: string): Promise<void>
  /** Email a 6-digit sign-in code (says nothing about whether the address is a member's). */
  requestSignInCode(email: string): Promise<void>
  signInWithCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>

  members(): Promise<Member[]>
  createMember(input: MemberCreateInput): Promise<Member>
  updateMember(id: string, patch: MemberPatch): Promise<Member>
  /** PATCH /admin/me: the signed-in member's own public profile. */
  updateMe(patch: MemberSelfUpdateInput): Promise<Me>

  listSubmissions(status?: SubmissionStatus): Promise<ProjectSubmission[]>
  getSubmission(id: string): Promise<ProjectSubmission>
  updateSubmission(id: string, patch: SubmissionPatch): Promise<ProjectSubmission>
  acceptSubmission(id: string, input: SubmissionAcceptInput): Promise<AcceptedSubmission>
  declineSubmission(id: string, input: SubmissionDeclineInput): Promise<DeclinedSubmission>
  /** Draft (not queue) an email asking the sender for a call. */
  draftInvite(id: string, input: InviteDraftInput): Promise<InviteDraft>
  submissionTranscript(id: string): Promise<IntakeTranscript | null>
  listApplications(status?: ApplicationStatus): Promise<MemberApplication[]>
  getApplication(id: string): Promise<MemberApplication>
  updateApplication(id: string, patch: ApplicationPatch): Promise<MemberApplication>
  acceptApplication(id: string, input: ApplicationAcceptInput): Promise<AcceptedApplication>
  applicationTranscript(id: string): Promise<IntakeTranscript | null>

  listOutbox(filter?: OutboxFilter): Promise<OutboxEmail[]>
  getOutbox(id: string): Promise<OutboxEmail>
  draftEmail(input: OutboxDraftInput): Promise<OutboxEmail>
  updateOutbox(id: string, patch: OutboxPatch): Promise<OutboxEmail>
  approveOutbox(id: string): Promise<OutboxApproveResult>
  rejectOutbox(id: string): Promise<OutboxEmail>

  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project>
  createProject(input: ProjectInput): Promise<ProjectSaved>
  updateProject(id: string, patch: ProjectPatch): Promise<ProjectSaved>
  deleteProject(id: string): Promise<{ website: WebsiteRefresh }>
  setProjectTeam(id: string, team: ProjectTeam): Promise<{ team: TeamMember[]; website: WebsiteRefresh }>
  /** Every pitch awaiting a decision and every project, for the stage board. */
  projectBoard(): Promise<ProjectBoard>
  projectHistory(id: string): Promise<StatusChange[]>
  listProjectFiles(projectId: string): Promise<ProjectFile[]>
  /** A ticket to upload one project file straight to the private store (see ./uploads.ts). */
  projectFileTicket(projectId: string, file: ProjectFileUploadInput): Promise<UploadTicket>
  addProjectFile(projectId: string, input: ProjectFileCreateInput): Promise<ProjectFile>
  deleteProjectFile(projectId: string, fileId: number): Promise<void>
  /** Where the browser opens a project file (the API checks the session). Null in sample mode. */
  projectFileUrl(projectId: string, fileId: number): string | null
  listDeliverables(projectId: string): Promise<Deliverable[]>
  addDeliverable(projectId: string, input: DeliverableInput): Promise<Deliverable>
  updateDeliverable(projectId: string, id: string, patch: DeliverablePatch): Promise<Deliverable>
  deleteDeliverable(projectId: string, id: string): Promise<void>

  listPosts(filter?: PostFilter): Promise<Post[]>
  /** Every project under way, with its posts and the moments still ahead. */
  postBoard(): Promise<PostBoard>
  getPost(id: string): Promise<Post>
  /** Any post: a project's (any kind) or one about Novawerk itself (custom). */
  createPost(input: PostCreateInput): Promise<PostCreated>
  updatePost(id: string, patch: PostPatch): Promise<Post>
  /** Ask the promo agent for a (new) draft. */
  requestDraft(id: string): Promise<PostDraftRequested>
  approvePost(id: string): Promise<Post>
  skipPost(id: string): Promise<Post>
  restorePost(id: string): Promise<Post>
  /** A member posted it by hand: mark it published. */
  publishPost(id: string): Promise<Post>
  unpublishPost(id: string): Promise<Post>
  /** A 30-minute link for `pnpm post pull`: continue the post in the repo. */
  postExportLink(id: string): Promise<PostExportLink>
  /** One post picture as PNG (POST /admin/cards). */
  renderCard(input: CardRenderInput): Promise<Blob>

  listPartners(): Promise<Partner[]>
  createPartner(input: PartnerInput): Promise<Partner>
  updatePartner(id: string, patch: PartnerPatch): Promise<Partner>
  deletePartner(id: string): Promise<void>

  listFinance(): Promise<FinanceEntry[]>
  addFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry>
  listSubscribers(): Promise<Subscriber[]>
  /** CSV of everyone confirmed and not unsubscribed. */
  exportSubscribers(): Promise<string>
  listDocuments(): Promise<DocumentRow[]>

  /** Tickets to upload one file straight to Vercel Blob (see ./uploads.ts). */
  imageTicket(file: ImageUploadInput): Promise<UploadTicket>
  documentTicket(file: DocumentUploadInput): Promise<UploadTicket>
  createDocument(input: DocumentCreateInput): Promise<DocumentRow>
  deleteDocument(id: number): Promise<void>
  /** Where the browser opens a private document (the API checks the session). Null in sample mode. */
  documentFileUrl(id: number): string | null
  /** Where the browser opens the CV that came with a pitch or an application. Null in sample mode. */
  resumeFileUrl(kind: "submission" | "application", id: string): string | null

  /** Traffic, the intake funnel and agent usage over the last `days` days, plus the inbox right now. */
  metrics(days: number): Promise<AdminMetrics>
}

const { admin, auth } = client

const liveSource: AdminDataSource = {
  isSample: false,
  me: () => call(admin.me.$get()),
  signInWithGoogle: async (credential) => {
    await call(auth.google.$post({ json: { credential } }))
  },
  signInDev: async (email) => {
    await call(auth.dev.$post({ json: { email } }))
  },
  requestSignInCode: async (email) => {
    await call(auth.email.start.$post({ json: { email } }))
  },
  signInWithCode: async (email, code) => {
    await call(auth.email.verify.$post({ json: { email, code } }))
  },
  signOut: async () => {
    await call(auth.logout.$post())
  },

  members: () => call(admin.members.$get()),
  createMember: async (input) => {
    const { initiatorOf: _, ...member } = await call(admin.members.$post({ json: input }))
    return member
  },
  updateMember: (id, patch) => call(admin.members[":id"].$patch({ param: { id }, json: patch })),
  updateMe: (patch) => call(admin.me.$patch({ json: patch })),

  listSubmissions: (status) => call(admin.submissions.$get({ query: { status } })),
  getSubmission: (id) => call(admin.submissions[":id"].$get({ param: { id } })),
  updateSubmission: (id, patch) => call(admin.submissions[":id"].$patch({ param: { id }, json: patch })),
  acceptSubmission: (id, input) => call(admin.submissions[":id"].accept.$post({ param: { id }, json: input })),
  declineSubmission: (id, input) => call(admin.submissions[":id"].decline.$post({ param: { id }, json: input })),
  draftInvite: (id, input) => call(admin.submissions[":id"].invite.$post({ param: { id }, json: input })),
  submissionTranscript: async (id) =>
    (await call(admin.submissions[":id"].transcript.$get({ param: { id } }))).transcript,
  listApplications: (status) => call(admin.applications.$get({ query: { status } })),
  getApplication: (id) => call(admin.applications[":id"].$get({ param: { id } })),
  updateApplication: (id, patch) => call(admin.applications[":id"].$patch({ param: { id }, json: patch })),
  acceptApplication: (id, input) => call(admin.applications[":id"].accept.$post({ param: { id }, json: input })),
  applicationTranscript: async (id) =>
    (await call(admin.applications[":id"].transcript.$get({ param: { id } }))).transcript,

  listOutbox: (filter = {}) => call(admin.outbox.$get({ query: filter })),
  getOutbox: (id) => call(admin.outbox[":id"].$get({ param: { id } })),
  draftEmail: (input) => call(admin.outbox.$post({ json: input })),
  updateOutbox: (id, patch) => call(admin.outbox[":id"].$patch({ param: { id }, json: patch })),
  approveOutbox: (id) => call(admin.outbox[":id"].approve.$post({ param: { id } })),
  rejectOutbox: (id) => call(admin.outbox[":id"].reject.$post({ param: { id } })),

  listProjects: () => call(admin.projects.$get()),
  getProject: (id) => call(admin.projects[":id"].$get({ param: { id } })),
  createProject: (input) => call(admin.projects.$post({ json: input })),
  updateProject: (id, patch) => call(admin.projects[":id"].$patch({ param: { id }, json: patch })),
  deleteProject: (id) => call(admin.projects[":id"].$delete({ param: { id } })),
  setProjectTeam: (id, team) => call(admin.projects[":id"].members.$put({ param: { id }, json: { members: team } })),
  projectBoard: () => call(admin.projects.board.$get()),
  projectHistory: (id) => call(admin.projects[":id"].history.$get({ param: { id } })),
  listProjectFiles: (projectId) => call(admin.projects[":id"].files.$get({ param: { id: projectId } })),
  projectFileTicket: (projectId, file) => call(admin.projects[":id"].files.upload.$post({ param: { id: projectId }, json: file })),
  addProjectFile: (projectId, input) => call(admin.projects[":id"].files.$post({ param: { id: projectId }, json: input })),
  deleteProjectFile: async (projectId, fileId) => {
    await call(admin.projects[":id"].files[":fileId"].$delete({ param: { id: projectId, fileId: String(fileId) } }))
  },
  projectFileUrl: (projectId, fileId) => `${API_URL}/admin/projects/${projectId}/files/${fileId}`,
  listDeliverables: (projectId) => call(admin.projects[":id"].deliverables.$get({ param: { id: projectId } })),
  addDeliverable: (projectId, input) =>
    call(admin.projects[":id"].deliverables.$post({ param: { id: projectId }, json: input })),
  updateDeliverable: (projectId, id, patch) =>
    call(admin.projects[":id"].deliverables[":deliverableId"].$patch({ param: { id: projectId, deliverableId: id }, json: patch })),
  deleteDeliverable: async (projectId, id) => {
    await call(admin.projects[":id"].deliverables[":deliverableId"].$delete({ param: { id: projectId, deliverableId: id } }))
  },

  listPosts: (filter = {}) => call(admin.posts.$get({ query: filter })),
  postBoard: () => call(admin.posts.board.$get()),
  getPost: (id) => call(admin.posts[":id"].$get({ param: { id } })),
  createPost: (input) => call(admin.posts.$post({ json: input })),
  updatePost: (id, patch) => call(admin.posts[":id"].$patch({ param: { id }, json: patch })),
  requestDraft: (id) => call(admin.posts[":id"].draft.$post({ param: { id } })),
  approvePost: (id) => call(admin.posts[":id"].approve.$post({ param: { id } })),
  skipPost: (id) => call(admin.posts[":id"].skip.$post({ param: { id } })),
  restorePost: (id) => call(admin.posts[":id"].restore.$post({ param: { id } })),
  publishPost: (id) => call(admin.posts[":id"].publish.$post({ param: { id } })),
  unpublishPost: (id) => call(admin.posts[":id"].unpublish.$post({ param: { id } })),
  postExportLink: (id) => call(admin.posts[":id"]["export-link"].$post({ param: { id } })),
  renderCard: async (input) => {
    const response = (await admin.cards.$post({ json: input })) as unknown as Response
    if (!response.ok) {
      let body = null
      try {
        body = await response.json()
      } catch {
        // Not JSON. Keep the status code.
      }
      throw new ApiError(response.status, body)
    }
    return response.blob()
  },

  listPartners: () => call(admin.partners.$get()),
  createPartner: (input) => call(admin.partners.$post({ json: input })),
  updatePartner: (id, patch) => call(admin.partners[":id"].$patch({ param: { id }, json: patch })),
  deletePartner: async (id) => {
    await call(admin.partners[":id"].$delete({ param: { id } }))
  },

  listFinance: () => call(admin.finance.$get()),
  addFinanceEntry: (input) => call(admin.finance.$post({ json: input })),
  listSubscribers: () => call(admin.subscribers.$get()),
  exportSubscribers: () => callText(admin.subscribers.export.$get()),
  listDocuments: () => call(admin.documents.$get()),

  imageTicket: (file) => call(admin.uploads.image.$post({ json: file })),
  documentTicket: (file) => call(admin.documents.upload.$post({ json: file })),
  createDocument: (input) => call(admin.documents.$post({ json: input })),
  deleteDocument: async (id) => {
    await call(admin.documents[":id"].$delete({ param: { id: String(id) } }))
  },
  documentFileUrl: (id) => `${API_URL}/admin/documents/${id}/file`,
  resumeFileUrl: (kind, id) => `${API_URL}/admin/${kind === "submission" ? "submissions" : "applications"}/${id}/resume`,

  metrics: (days) => call(admin.metrics.$get({ query: { days: String(days) } })),
}

// ─── Sample store (in memory, resets on reload) ──────────────────────────────

const delay = (ms = 250) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt)
const nowIso = () => new Date().toISOString()
const today = () => nowIso().slice(0, 10)

const store = {
  members: new Map(SAMPLE_MEMBERS.map((m) => [m.id, { ...m }])),
  submissions: new Map(SAMPLE_SUBMISSIONS.map((s) => [s.id, { ...s }])),
  applications: new Map(SAMPLE_APPLICATIONS.map((a) => [a.id, { ...a }])),
  outbox: new Map(SAMPLE_OUTBOX.map((o) => [o.id, { ...o }])),
  projects: new Map(SAMPLE_PROJECTS.map((p) => [p.id, { ...p, team: [...p.team] }])),
  partners: new Map(SAMPLE_PARTNERS.map((p) => [p.id, { ...p }])),
  finance: [...SAMPLE_FINANCE],
  subscribers: [...SAMPLE_SUBSCRIBERS],
  documents: [...SAMPLE_DOCUMENTS] as DocumentRow[],
  posts: new Map(SAMPLE_POSTS.map((p) => [p.id, structuredClone(p)])),
  deliverables: SAMPLE_DELIVERABLES.map((d) => ({ ...d })),
  history: [...SAMPLE_HISTORY],
}

/** The same error the API gives, so forms show the message under the field. */
function refuse(message: string, field?: string, status = 400): never {
  throw new ApiError(status, { error: message, ...(field ? { issues: { [field]: [message] } } : {}) })
}

function notFound(what: string): never {
  refuse(`${what} not found`, undefined, 404)
}

/** Drop `undefined` keys so a patch only touches what it names (like the API). */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

function freeHandle(base: string, taken: (value: string) => boolean): string {
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}

const SAMPLE_WEBSITE: WebsiteRefresh = "not-configured"

/** Open ones by due date, then the done ones (like the API). */
function sortDeliverables(list: Deliverable[]) {
  return [...list].sort(
    (a, b) =>
      Number(Boolean(a.doneOn)) - Number(Boolean(b.doneOn)) ||
      (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

/** What the inbox holds right now, counted like GET /admin/metrics does. */
function sampleInbox(): AdminMetrics["inbox"] {
  const submissions = [...store.submissions.values()]
  const applications = [...store.applications.values()]
  const pending = [...store.outbox.values()].filter((o) => o.status === "pending")
  const oldest = (rows: { createdAt: string }[]) => rows.map((r) => r.createdAt).sort()[0] ?? null
  return {
    submissions: Object.fromEntries(
      SUBMISSION_STATUSES.map((status) => [status, submissions.filter((s) => s.status === status).length]),
    ) as AdminMetrics["inbox"]["submissions"],
    applications: Object.fromEntries(
      APPLICATION_STATUSES.map((status) => [status, applications.filter((a) => a.status === status).length]),
    ) as AdminMetrics["inbox"]["applications"],
    oldestNewSubmissionAt: oldest(submissions.filter((s) => s.status === "new")),
    oldestNewApplicationAt: oldest(applications.filter((a) => a.status === "new")),
    outboxPending: pending.length,
    oldestPendingEmailAt: oldest(pending),
  }
}

function sortProjects(list: Project[]) {
  return list.sort(
    (a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  )
}

const sampleSource: AdminDataSource = {
  isSample: true,
  me: async () => SAMPLE_ME,
  signInWithGoogle: () => delay(),
  signInDev: () => delay(),
  requestSignInCode: () => delay(),
  signInWithCode: () => delay(),
  signOut: () => delay(),

  members: async () => {
    await delay(100)
    return [...store.members.values()].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName),
    )
  },
  createMember: async (input) => {
    await delay()
    if (store.members.has(input.id)) refuse("Another member already has this handle", "id")
    const email = input.email.trim().toLowerCase()
    if ([...store.members.values()].some((m) => m.email.toLowerCase() === email)) {
      refuse("Another member already uses this email", "email")
    }
    const member: Member = {
      id: input.id,
      displayName: input.displayName,
      email,
      canAdmin: input.canAdmin ?? false,
      joinedOn: input.joinedOn ?? today(),
      active: true,
      publicProfile: false,
      profileHandle: null,
      profileBio: null,
      createdAt: nowIso(),
    }
    store.members.set(member.id, member)
    return { ...member }
  },
  updateMe: async (patch) => {
    await delay()
    // The same rules and words as the API (memberSelfUpdateInput, @nw/tasks members.ts and handles.ts).
    const parsed = memberSelfUpdateInput.safeParse(patch)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
      refuse(issue.message, issue.path[0] ? String(issue.path[0]) : undefined)
    }
    const clean = definedOnly(parsed.data)
    const handle = clean.profileHandle ?? SAMPLE_ME.profileHandle
    if ((clean.publicProfile ?? SAMPLE_ME.publicProfile) && !handle) {
      refuse("Choose a handle first: it's the address of your profile", "profileHandle")
    }
    if (clean.profileHandle && clean.profileHandle !== SAMPLE_ME.profileHandle) {
      if (isReservedHandle(clean.profileHandle)) refuse("That handle is reserved. Pick another one.", "profileHandle")
      const taken =
        SAMPLE_CONTRIBUTOR_HANDLES.includes(clean.profileHandle) ||
        [...store.members.values()].some(
          (m) => m.id !== SAMPLE_ME.id && (m.id === clean.profileHandle || m.profileHandle === clean.profileHandle),
        )
      if (taken) refuse("That handle is taken", "profileHandle", 409)
    }
    Object.assign(SAMPLE_ME, clean)
    return { ...SAMPLE_ME }
  },
  updateMember: async (id, patch) => {
    await delay()
    const current = store.members.get(id) ?? notFound("Member")
    if (id === SAMPLE_ME.id && patch.canAdmin === false) {
      refuse("You can't remove your own admin access", "canAdmin")
    }
    if (id === SAMPLE_ME.id && patch.active === false) refuse("You can't mark yourself inactive", "active")
    const next = { ...current, ...definedOnly(patch) }
    store.members.set(id, next)
    return { ...next }
  },

  listSubmissions: async (status) => {
    await delay()
    return [...store.submissions.values()].filter((s) => !status || s.status === status).sort(byNewest)
  },
  getSubmission: async (id) => {
    await delay(150)
    return { ...(store.submissions.get(id) ?? notFound("Pitch")) }
  },
  updateSubmission: async (id, patch) => {
    await delay()
    const current = store.submissions.get(id) ?? notFound("Pitch")
    if (patch.status === "accepted" && !current.projectId) {
      refuse("Use “Accept and create project” to accept a pitch", "status")
    }
    const next = { ...current, ...definedOnly(patch), updatedAt: nowIso() }
    store.submissions.set(id, next)
    return { ...next }
  },
  acceptSubmission: async (id, input) => {
    await delay()
    const current = store.submissions.get(id) ?? notFound("Pitch")
    let project = current.projectId ? store.projects.get(current.projectId) : undefined
    const projectCreated = !project
    if (!project) {
      const slugs = new Set([...store.projects.values()].map((p) => p.slug))
      if (input.slug && slugs.has(input.slug)) refuse("Another project already uses this slug", "slug")
      const slug = input.slug ?? freeHandle(toHandle(current.projectName, 80) || "project", (s) => slugs.has(s))
      project = {
        ...SAMPLE_PROJECTS[2]!,
        id: crypto.randomUUID(),
        slug,
        title: input.title ?? current.projectName,
        submissionId: id,
        team: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      store.projects.set(project.id, project)
    }
    // Like the API: the pitcher becomes a Member (or is found by email) and the Initiator.
    let initiator = [...store.members.values()].find((m) => m.email.toLowerCase() === current.email.toLowerCase())
    const memberCreated = !initiator
    const addedAsMember = memberCreated || !initiator?.active
    if (!initiator) {
      const id = freeHandle(toHandle(current.name, 39) || "member", (h) => store.members.has(h))
      initiator = {
        ...[...store.members.values()][1]!,
        id,
        displayName: current.name,
        email: current.email.toLowerCase(),
        canAdmin: false,
        active: true,
        joinedOn: nowIso().slice(0, 10),
        publicProfile: false,
        profileHandle: null,
        profileBio: null,
      }
      store.members.set(id, initiator)
    } else if (!initiator.active) {
      initiator.active = true
    }
    if (!project.team.some((t) => t.memberId === initiator.id)) {
      project.team.push({ memberId: initiator.id, displayName: initiator.displayName, role: "Initiator" })
    }
    const submission = { ...current, status: "accepted" as const, projectId: project.id, updatedAt: nowIso() }
    store.submissions.set(id, submission)
    const { team: _, ...projectRow } = project
    return {
      submission,
      project: projectRow,
      projectCreated,
      initiator: { id: initiator.id, displayName: initiator.displayName },
      memberCreated,
      addedAsMember,
      // Sample mode has no outbox to write to.
      emailQueued: false,
    }
  },
  declineSubmission: async (id) => {
    await delay()
    const current = store.submissions.get(id) ?? notFound("Pitch")
    if (current.status === "accepted") refuse("This pitch is a project now. Archive the project instead.", undefined, 409)
    const submission = { ...current, status: "declined" as const, updatedAt: nowIso() }
    store.submissions.set(id, submission)
    return { submission, emailQueued: false }
  },
  draftInvite: async (id, input) => {
    await delay(400)
    const current = store.submissions.get(id) ?? notFound("Pitch")
    const first = current.name.split(/\s+/)[0] ?? current.name
    return {
      to: current.email,
      subject: `A call about ${current.projectName}?`,
      body: `Hi ${first},\n\nThanks again for pitching ${current.projectName}. We'd like to talk it through with you.\n\nWould one of these times work?\n${input.times.map((t) => `- ${t}`).join("\n")}\n\nTalk soon,\nNovawerk\n`,
      by: "template" as const,
      note: "Sample mode: no language model here.",
    }
  },
  submissionTranscript: async (id) => {
    await delay(150)
    return SAMPLE_TRANSCRIPTS[id] ?? null
  },
  listApplications: async (status) => {
    await delay()
    return [...store.applications.values()].filter((a) => !status || a.status === status).sort(byNewest)
  },
  getApplication: async (id) => {
    await delay(150)
    return { ...(store.applications.get(id) ?? notFound("Application")) }
  },
  updateApplication: async (id, patch) => {
    await delay()
    const current = store.applications.get(id) ?? notFound("Application")
    if (patch.status === "accepted" && !patch.memberId && !current.memberId) {
      refuse("Use “Accept as member” to accept an application", "status")
    }
    const next = { ...current, ...definedOnly(patch), updatedAt: nowIso() }
    store.applications.set(id, next)
    return { ...next }
  },
  acceptApplication: async (id, input) => {
    await delay()
    const current = store.applications.get(id) ?? notFound("Application")
    let member =
      (current.memberId ? store.members.get(current.memberId) : undefined) ??
      [...store.members.values()].find((m) => m.email.toLowerCase() === current.email.toLowerCase())
    const memberCreated = !member
    if (!member) {
      if (input.memberId && store.members.has(input.memberId)) {
        refuse("Another member already has this handle", "memberId")
      }
      const memberId =
        input.memberId ?? freeHandle(toHandle(current.name) || "member", (h) => store.members.has(h))
      member = {
        id: memberId,
        displayName: input.displayName ?? current.name,
        email: current.email.toLowerCase(),
        canAdmin: false,
        publicProfile: false,
        profileHandle: null,
        profileBio: null,
        joinedOn: today(),
        active: true,
        createdAt: nowIso(),
      }
      store.members.set(member.id, member)
    } else if (!member.active) {
      member = { ...member, active: true }
      store.members.set(member.id, member)
    }
    const application = { ...current, status: "accepted" as const, memberId: member.id, updatedAt: nowIso() }
    store.applications.set(id, application)
    return { application, member, memberCreated, initiatorOf: [] }
  },
  applicationTranscript: async () => {
    await delay(150)
    return null
  },

  listOutbox: async (filter = {}) => {
    await delay()
    return [...store.outbox.values()]
      .filter(
        (o) =>
          (!filter.status || o.status === filter.status) &&
          (!filter.relatedTable || o.relatedTable === filter.relatedTable) &&
          (!filter.relatedId || o.relatedId === filter.relatedId),
      )
      .sort(byNewest)
  },
  getOutbox: async (id) => {
    await delay(100)
    return { ...(store.outbox.get(id) ?? notFound("Email")) }
  },
  draftEmail: async (input) => {
    await delay()
    const row: OutboxEmail = {
      id: crypto.randomUUID(),
      to: input.to.trim(),
      subject: input.subject.trim(),
      body: input.body,
      draftedBy: `admin:${SAMPLE_ME.id}`,
      relatedTable: input.relatedTable ?? null,
      relatedId: input.relatedId ?? null,
      status: "pending",
      approvedBy: null,
      approvedAt: null,
      sentAt: null,
      providerMessageId: null,
      error: null,
      createdAt: nowIso(),
    }
    store.outbox.set(row.id, row)
    return { ...row }
  },
  updateOutbox: async (id, patch) => {
    await delay()
    const current = store.outbox.get(id) ?? notFound("Email")
    if (current.status !== "pending") refuse("Only a pending email can be edited")
    const next = { ...current, ...definedOnly(patch) }
    store.outbox.set(id, next)
    return { ...next }
  },
  approveOutbox: async (id) => {
    await delay(400)
    const current = store.outbox.get(id) ?? notFound("Email")
    if (!["pending", "failed", "approved"].includes(current.status) || current.sentAt) {
      refuse("Only a pending or failed email can be approved or rejected")
    }
    const email: OutboxEmail = {
      ...current,
      status: "approved",
      approvedBy: current.approvedBy && current.status === "approved" ? current.approvedBy : SAMPLE_ME.id,
      approvedAt: current.status === "approved" && current.approvedAt ? current.approvedAt : nowIso(),
      error: null,
    }
    store.outbox.set(id, email)
    return { email, sent: false, note: "Sample mode: approved, nothing was sent." }
  },
  rejectOutbox: async (id) => {
    await delay()
    const current = store.outbox.get(id) ?? notFound("Email")
    if (current.status === "sent" || current.status === "rejected") {
      refuse("Only a pending or failed email can be approved or rejected")
    }
    const next = { ...current, status: "rejected" as const, approvedBy: SAMPLE_ME.id, approvedAt: nowIso() }
    store.outbox.set(id, next)
    return { ...next }
  },

  listProjects: async () => {
    await delay()
    return sortProjects([...store.projects.values()].map((p) => ({ ...p })))
  },
  getProject: async (id) => {
    await delay(150)
    const p = store.projects.get(id) ?? notFound("Project")
    return { ...p, team: [...p.team] }
  },
  createProject: async (input) => {
    await delay()
    if ([...store.projects.values()].some((p) => p.slug === input.slug)) {
      refuse("Another project already uses this slug", "slug")
    }
    const project: Project = {
      ...SAMPLE_PROJECTS[2]!,
      submissionId: null,
      ...definedOnly(input),
      id: crypto.randomUUID(),
      team: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as Project
    store.projects.set(project.id, project)
    return { project: { ...project }, website: SAMPLE_WEBSITE, postsPlanned: 0 }
  },
  updateProject: async (id, patch) => {
    await delay()
    const current = store.projects.get(id) ?? notFound("Project")
    if (patch.slug && [...store.projects.values()].some((p) => p.slug === patch.slug && p.id !== id)) {
      refuse("Another project already uses this slug", "slug")
    }
    const next = { ...current, ...definedOnly(patch), updatedAt: nowIso() } as Project
    if (patch.status === "launched" && current.status !== "launched" && !next.launchDate) next.launchDate = today()
    if (next.status !== current.status) {
      store.history.push({
        id: store.history.length + 1,
        projectId: id,
        fromStatus: current.status,
        toStatus: next.status,
        changedBy: SAMPLE_ME.id,
        changedByName: SAMPLE_ME.displayName,
        changedAt: nowIso(),
      })
    }
    store.projects.set(id, next)
    return { project: { ...next, team: [...next.team] }, website: SAMPLE_WEBSITE, postsPlanned: 0 }
  },
  deleteProject: async (id) => {
    await delay()
    if (!store.projects.delete(id)) notFound("Project")
    for (const s of store.submissions.values()) if (s.projectId === id) s.projectId = null
    return { website: SAMPLE_WEBSITE }
  },
  setProjectTeam: async (id, team) => {
    await delay()
    const current = store.projects.get(id) ?? notFound("Project")
    const next = team
      .map((t) => ({ ...t, displayName: store.members.get(t.memberId)?.displayName ?? t.memberId }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    store.projects.set(id, { ...current, team: next })
    return { team: next, website: SAMPLE_WEBSITE }
  },

  listProjectFiles: async () => {
    await delay(100)
    return []
  },
  projectFileTicket: () => refuse("Sample mode: uploads are off."),
  addProjectFile: () => refuse("Sample mode: uploads are off."),
  deleteProjectFile: () => refuse("Sample mode: uploads are off."),
  projectFileUrl: () => null,
  projectBoard: async () => {
    await delay()
    const posts = [...store.posts.values()]
    const projects = sortProjects([...store.projects.values()]).map((p) => {
      const own = posts.filter((post) => post.projectId === p.id)
      const open = sortDeliverables(store.deliverables.filter((d) => d.projectId === p.id && !d.doneOn))
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        tagline: p.tagline,
        status: p.status,
        coverUrl: p.coverUrl,
        launchDate: p.launchDate,
        featured: p.featured,
        submissionId: p.submissionId,
        buildingSince: store.history.find((h) => h.projectId === p.id && h.toStatus === "building")?.changedAt.slice(0, 10) ?? null,
        team: p.team.map(({ displayName, role }) => ({ displayName, role })),
        posts: {
          planned: own.filter((x) => x.status === "planned").length,
          drafted: own.filter((x) => x.status === "drafted").length,
          approved: own.filter((x) => x.status === "approved").length,
          published: own.filter((x) => x.status === "published").length,
          skipped: own.filter((x) => x.status === "skipped").length,
        },
        // The schedule runs in the API; sample mode has no "next" moment.
        next: null,
        openDeliverables: open.length,
        nextDeliverable: open[0] ? { title: open[0].title, dueOn: open[0].dueOn } : null,
        hints: [] as string[],
      }
    })
    const pitches = [...store.submissions.values()]
      .filter((s) => s.status !== "accepted")
      .sort(byNewest)
      .map((s) => ({
        id: s.id,
        projectName: s.projectName,
        name: s.name,
        status: s.status,
        aiSummary: s.aiSummary,
        reviewerId: s.reviewerId,
        createdAt: s.createdAt,
      }))
    return { today: today(), pitches, projects }
  },
  projectHistory: async (id) => {
    await delay(100)
    return store.history.filter((h) => h.projectId === id)
  },
  listDeliverables: async (projectId) => {
    await delay(100)
    return sortDeliverables(store.deliverables.filter((d) => d.projectId === projectId))
  },
  addDeliverable: async (projectId, input) => {
    await delay()
    const row: Deliverable = {
      id: crypto.randomUUID(),
      projectId,
      title: input.title,
      ownerId: input.ownerId ?? null,
      ownerName: input.ownerId ? (store.members.get(input.ownerId)?.displayName ?? null) : null,
      doneWhen: input.doneWhen ?? null,
      dueOn: input.dueOn ?? null,
      doneOn: input.doneOn ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    store.deliverables.push(row)
    return { ...row }
  },
  updateDeliverable: async (projectId, id, patch) => {
    await delay()
    const row = store.deliverables.find((d) => d.id === id && d.projectId === projectId) ?? notFound("Deliverable")
    Object.assign(row, definedOnly(patch), { updatedAt: nowIso() })
    if (patch.ownerId !== undefined) row.ownerName = patch.ownerId ? (store.members.get(patch.ownerId)?.displayName ?? null) : null
    return { ...row }
  },
  deleteDeliverable: async (_projectId, id) => {
    await delay()
    store.deliverables = store.deliverables.filter((d) => d.id !== id)
  },

  listPosts: async (filter = {}) => {
    await delay()
    return [...store.posts.values()]
      .filter((p) => (!filter.status || p.status === filter.status) && (!filter.projectId || p.projectId === filter.projectId))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((p) => structuredClone(p))
  },
  getPost: async (id) => {
    await delay(100)
    return structuredClone(store.posts.get(id) ?? notFound("Post"))
  },
  postBoard: async () => {
    await delay()
    const posts = [...store.posts.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    const lanes = [...store.projects.values()]
      .filter((p) => (p.status !== "draft" && p.status !== "archived") || posts.some((post) => post.projectId === p.id))
      .map((p) => ({
        project: { id: p.id, title: p.title, slug: p.slug, status: p.status, launchDate: p.launchDate },
        buildingSince: store.history.find((h) => h.projectId === p.id && h.toStatus === "building")?.changedAt.slice(0, 10) ?? null,
        posts: structuredClone(posts.filter((post) => post.projectId === p.id)),
        // The schedule runs in the API; sample mode shows only the posts that exist.
        upcoming: [],
        hints: [] as string[],
      }))
    return { today: today(), lanes, general: structuredClone(posts.filter((post) => !post.projectId)) }
  },
  createPost: async (input) => {
    await delay()
    const projectId = input.projectId ?? null
    const project = projectId ? (store.projects.get(projectId) ?? notFound("Project")) : null
    const taken = [...store.posts.values()].filter((p) => p.projectId === projectId && p.kind === input.kind).map((p) => p.seq)
    const multiple = input.kind === "progress" || input.kind === "retro" || input.kind === "custom"
    if (!multiple && taken.length) refuse(`This project already has a ${input.kind.replace(/_/g, " ")} post`, "kind", 409)
    const post: Post = {
      id: crypto.randomUUID(),
      projectId,
      kind: input.kind,
      label: input.kind === "custom" ? (input.label ?? null) : null,
      seq: multiple ? Math.max(0, ...taken) + 1 : 0,
      dueOn: input.dueOn ?? today(),
      status: "planned",
      langs: input.langs ?? ["zh", "en"],
      platforms: input.platforms ?? null,
      withCard: input.withCard ?? true,
      images: [],
      brief: null,
      photoUrl: null,
      content: null,
      sourcePath: null,
      sourceHash: null,
      sourceCommit: null,
      draftRequestedAt: null,
      draftedAt: null,
      draftError: "Sample mode: the promo agent doesn't run here. Write the text yourself.",
      approvedBy: null,
      approvedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publishedAt: null,
      project: project && { id: project.id, title: project.title, slug: project.slug, link: project.link, coverUrl: project.coverUrl, gallery: project.gallery },
    }
    store.posts.set(post.id, post)
    return { post: structuredClone(post), dispatched: false }
  },
  updatePost: async (id, patch) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (post.status === "published" || post.status === "skipped") refuse(`This post is ${post.status}`, undefined, 409)
    if (post.sourcePath) refuse(`This post lives in the repo (${post.sourcePath}). Change it there.`, undefined, 409)
    const reviewed =
      (post.status === "planned" && patch.content) ||
      (post.status === "approved" && (patch.content || patch.langs || patch.images || patch.withCard !== undefined || patch.photoUrl !== undefined))
    Object.assign(post, definedOnly(patch), { updatedAt: nowIso() })
    if (reviewed) Object.assign(post, { status: "drafted", approvedBy: null, approvedAt: null })
    return structuredClone(post)
  },
  requestDraft: async () => refuse("Sample mode: the promo agent doesn't run here. Write the text yourself.", undefined, 503),
  approvePost: async (id) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (!post.content) refuse("There is nothing to approve yet", undefined, 409)
    const gaps = placeholdersIn(post.content, post.langs)
    if (gaps.length) refuse(`Fill these in first: ${gaps.join(", ")}`, "content")
    const links = xiaohongshuLinks(post, post.content)
    if (links.length) refuse(`Xiaohongshu throttles notes with a link; take these out of the Chinese version: ${links.join(", ")}`, "content")
    Object.assign(post, { status: "approved", approvedBy: SAMPLE_ME.id, approvedAt: nowIso() })
    return structuredClone(post)
  },
  skipPost: async (id) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (post.status === "published") refuse("A published post can't be skipped", undefined, 409)
    post.status = "skipped"
    return structuredClone(post)
  },
  restorePost: async (id) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (post.status !== "skipped") refuse("Only a skipped post can be restored", undefined, 409)
    post.status = post.content ? "drafted" : "planned"
    return structuredClone(post)
  },
  publishPost: async (id) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (post.status !== "approved") refuse("Approve the post before you mark it posted", undefined, 409)
    Object.assign(post, { status: "published", publishedAt: nowIso() })
    return structuredClone(post)
  },
  unpublishPost: async (id) => {
    await delay()
    const post = store.posts.get(id) ?? notFound("Post")
    if (post.status !== "published") refuse("Only a published post can be taken back", undefined, 409)
    Object.assign(post, { status: "approved", publishedAt: null })
    return structuredClone(post)
  },
  postExportLink: async (id) => {
    await delay()
    const url = `https://api.novawerk.io/exports/posts/${id}?expires=0&sig=sample`
    return { url, expiresAt: nowIso(), command: `pnpm post pull "${url}"` }
  },
  renderCard: () => refuse("Sample mode: card pictures render in the API. Run it to see them.", undefined, 503),

  listPartners: async () => {
    await delay()
    return [...store.partners.values()].sort((a, b) => a.name.localeCompare(b.name))
  },
  createPartner: async (input) => {
    await delay()
    if (store.partners.has(input.id)) refuse("Another partner already has this id", "id")
    const partner: Partner = {
      id: input.id,
      name: input.name,
      stage: input.stage ?? "intro",
      primaryContact: input.primaryContact || null,
      primaryEmail: input.primaryEmail || null,
      owner: input.owner ?? null,
      lastTouchAt: input.lastTouchAt ?? null,
      createdAt: nowIso(),
    }
    store.partners.set(partner.id, partner)
    return { ...partner }
  },
  updatePartner: async (id, patch) => {
    await delay()
    const current = store.partners.get(id) ?? notFound("Partner")
    const clean = definedOnly(patch)
    const next: Partner = {
      ...current,
      ...clean,
      primaryContact: clean.primaryContact === undefined ? current.primaryContact : clean.primaryContact || null,
      primaryEmail: clean.primaryEmail === undefined ? current.primaryEmail : clean.primaryEmail || null,
    }
    store.partners.set(id, next)
    return { ...next }
  },
  deletePartner: async (id) => {
    await delay()
    if (!store.partners.delete(id)) notFound("Partner")
  },

  listFinance: async () => {
    await delay()
    return [...store.finance].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id - a.id)
  },
  addFinanceEntry: async (input) => {
    await delay()
    const row: FinanceEntry = {
      id: Math.max(0, ...store.finance.map((f) => f.id)) + 1,
      entryDate: input.entryDate,
      direction: input.direction,
      amountCents: input.amountCents,
      currency: "EUR",
      category: input.category || null,
      description: input.description || null,
      owner: SAMPLE_ME.id,
      partnerId: input.partnerId ?? null,
      receiptDocumentId: input.receiptDocumentId ?? null,
      createdAt: nowIso(),
    }
    store.finance.push(row)
    return { ...row }
  },
  listSubscribers: async () => {
    await delay()
    return [...store.subscribers]
  },
  exportSubscribers: async () => {
    await delay()
    const rows = store.subscribers.filter((s) => s.status === "confirmed").reverse()
    return ["email,source,confirmed_at", ...rows.map((r) => `${r.email},${r.source},${r.confirmedAt}`), ""].join("\r\n")
  },
  listDocuments: async () => {
    await delay()
    return store.documents.filter((d) => d.owner === SAMPLE_ME.id || d.owner === null)
  },

  imageTicket: () => refuse("Sample mode: uploads are off. Paste an image link instead."),
  documentTicket: () => refuse("Sample mode: uploads are off."),
  createDocument: () => refuse("Sample mode: uploads are off."),
  deleteDocument: async (id) => {
    await delay()
    store.documents = store.documents.filter((d) => d.id !== id)
  },
  documentFileUrl: () => null,
  resumeFileUrl: () => null,

  metrics: async (days) => {
    await delay(300)
    return sampleMetrics(days, sampleInbox())
  },
}

export const dataSource: AdminDataSource = USE_SAMPLE_DATA ? sampleSource : liveSource
