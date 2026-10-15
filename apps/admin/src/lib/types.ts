// Wire shapes, inferred from apps/api through the typed Hono client. Timestamps arrive as ISO
// strings (that's what JSON carries). If a route changes shape, this file stops compiling.

import type { InferResponseType } from "hono/client"

import type {
  ApplicationAcceptInput,
  ApplicationStatus,
  ApplicationUpdateInput,
  DocumentCreateInput,
  FinanceEntryInput,
  IntakeTranscript,
  MemberCreateInput,
  MemberUpdateInput,
  OutboxDraftInput,
  OutboxRelatedTable,
  OutboxStatus,
  OutboxUpdateInput,
  PartnerInput,
  PartnerStage,
  PartnerUpdateInput,
  CardRenderInput,
  DeliverableInput,
  DeliverableUpdateInput,
  PostCreateInput,
  PostKind,
  PostStatus,
  PostUpdateInput,
  ProjectInput,
  ProjectStatus,
  ProjectTeamInput,
  ProjectUpdateInput,
  InviteDraftInput,
  ProjectFileCreateInput,
  ProjectFileUploadInput,
  SubmissionAcceptInput,
  SubmissionDeclineInput,
  SubmissionStatus,
  SubmissionUpdateInput,
  SubscriberStatus,
} from "@nw/contracts"

import type { client } from "./api-client"

type Admin = (typeof client)["admin"]

export type {
  SubscriberStatus,
  ApplicationAcceptInput,
  ApplicationStatus,
  DocumentCreateInput,
  FinanceEntryInput,
  IntakeTranscript,
  MemberCreateInput,
  OutboxDraftInput,
  OutboxRelatedTable,
  OutboxStatus,
  PartnerInput,
  PartnerStage,
  CardRenderInput,
  DeliverableInput,
  PostCreateInput,
  PostKind,
  PostStatus,
  ProjectInput,
  ProjectStatus,
  InviteDraftInput,
  ProjectFileCreateInput,
  ProjectFileUploadInput,
  SubmissionAcceptInput,
  SubmissionDeclineInput,
  SubmissionStatus,
}

/** The signed-in member, from GET /admin/me. */
export type Me = InferResponseType<Admin["me"]["$get"], 200>

// ─── Members ─────────────────────────────────────────────────────────────────

/** GET /admin/members. */
export type Member = InferResponseType<Admin["members"]["$get"], 200>[number]
/** A member, for reviewer and owner pickers. */
export type MemberSummary = Pick<Member, "id" | "displayName" | "email" | "active">
export type MemberPatch = MemberUpdateInput

// ─── Inbox ───────────────────────────────────────────────────────────────────

/** A project pitch from novawerk.io/submit, with the project it became. GET /admin/submissions/:id. */
export type ProjectSubmission = InferResponseType<Admin["submissions"][":id"]["$get"], 200>

/** Body of PATCH /admin/submissions/:id. `null` clears a field. */
export type SubmissionPatch = SubmissionUpdateInput

/** A membership application from novawerk.io/join. GET /admin/applications/:id. */
export type MemberApplication = InferResponseType<Admin["applications"][":id"]["$get"], 200>

/** Body of PATCH /admin/applications/:id. `null` clears a field. */
export type ApplicationPatch = ApplicationUpdateInput

/** POST /admin/submissions/:id/decline. */
export type DeclinedSubmission = InferResponseType<Admin["submissions"][":id"]["decline"]["$post"], 200>
/** POST /admin/submissions/:id/invite: a call invite drafted for the member to edit. */
export type InviteDraft = InferResponseType<Admin["submissions"][":id"]["invite"]["$post"], 200>
/** POST /admin/submissions/:id/accept. */
export type AcceptedSubmission = InferResponseType<Admin["submissions"][":id"]["accept"]["$post"], 200>
/** POST /admin/applications/:id/accept. */
export type AcceptedApplication = InferResponseType<Admin["applications"][":id"]["accept"]["$post"], 200>

// ─── Outbox ──────────────────────────────────────────────────────────────────

/** One email waiting for (or past) a member's approval. GET /admin/outbox/:id. */
export type OutboxEmail = InferResponseType<Admin["outbox"][":id"]["$get"], 200>
export type OutboxPatch = OutboxUpdateInput
/** POST /admin/outbox/:id/approve: `sent: false` comes with a `note` saying why. */
export type OutboxApproveResult = InferResponseType<Admin["outbox"][":id"]["approve"]["$post"], 200>
export type OutboxFilter = { status?: OutboxStatus; relatedTable?: OutboxRelatedTable; relatedId?: string }

// ─── Portfolio ───────────────────────────────────────────────────────────────

/** A portfolio project with its team. GET /admin/projects/:id. */
export type Project = InferResponseType<Admin["projects"][":id"]["$get"], 200>
export type TeamMember = Project["team"][number]
export type ProjectPatch = ProjectUpdateInput
export type ProjectTeam = ProjectTeamInput["members"]
/** POST / PATCH /admin/projects: the project plus what happened to the website. */
export type ProjectSaved = InferResponseType<Admin["projects"]["$post"], 201>
/** "updated" | "not-configured" | "failed" */
export type WebsiteRefresh = ProjectSaved["website"]

// ─── Lifecycle and posts ─────────────────────────────────────────────────────

/** GET /admin/projects/:id/files: the project's own files, with who added them. */
export type ProjectFile = InferResponseType<Admin["projects"][":id"]["files"]["$get"], 200>[number]

/** GET /admin/projects/board: pitches awaiting a decision and every project, for the stage board. */
export type ProjectBoard = InferResponseType<Admin["projects"]["board"]["$get"], 200>
export type BoardPitch = ProjectBoard["pitches"][number]
export type BoardProject = ProjectBoard["projects"][number]

/** One line of a project's timeline. GET /admin/projects/:id/history. */
export type StatusChange = InferResponseType<Admin["projects"][":id"]["history"]["$get"], 200>[number]
/** GET /admin/projects/:id/deliverables. */
export type Deliverable = InferResponseType<Admin["projects"][":id"]["deliverables"]["$get"], 200>[number]
export type DeliverablePatch = DeliverableUpdateInput

/**
 * A post with its project (and the project's pictures; null for a post about Novawerk itself).
 * GET /admin/posts/:id.
 */
export type Post = InferResponseType<Admin["posts"][":id"]["$get"], 200>
export type PostPatch = PostUpdateInput
export type PostFilter = { status?: PostStatus; projectId?: string }
/**
 * GET /admin/posts/board: one lane per project, with its posts and the moments still ahead, and
 * the posts that belong to no project.
 */
export type PostBoard = InferResponseType<Admin["posts"]["board"]["$get"], 200>
export type PostLane = PostBoard["lanes"][number]
/** POST /admin/posts/:id/draft: `dispatched` says whether the agent was woken right away. */
export type PostDraftRequested = InferResponseType<Admin["posts"][":id"]["draft"]["$post"], 200>
/** POST /admin/posts. */
export type PostCreated = InferResponseType<Admin["posts"]["$post"], 201>
/** POST /admin/posts/:id/export-link: a link and the `pnpm post pull` command that takes it. */
export type PostExportLink = InferResponseType<Admin["posts"][":id"]["export-link"]["$post"], 200>

// ─── Organisation ────────────────────────────────────────────────────────────

export type Partner = InferResponseType<Admin["partners"]["$get"], 200>[number]
export type PartnerPatch = PartnerUpdateInput
export type FinanceEntry = InferResponseType<Admin["finance"]["$get"], 200>[number]
export type Subscriber = InferResponseType<Admin["subscribers"]["$get"], 200>[number]
export type DocumentRow = InferResponseType<Admin["documents"]["$get"], 200>[number]

/** A short-lived permission to upload one file straight to Vercel Blob. */
export type UploadTicket = InferResponseType<Admin["uploads"]["image"]["$post"], 200>

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** GET /admin/metrics?days=: traffic, the intake funnel, agents and the inbox right now. */
export type AdminMetrics = InferResponseType<Admin["metrics"]["$get"], 200>

// ─── Contributor task board (admin) ──────────────────────────────────────────

export type AdminTaskRow = InferResponseType<Admin["tasks"]["$get"], 200>[number]
export type AdminTaskDetail = InferResponseType<Admin["tasks"][":id"]["$get"], 200>
export type AdminProposal = AdminTaskDetail["proposals"][number]
export type AdminPost = AdminTaskDetail["posts"][number]
export type AdminTaskEvent = AdminTaskDetail["events"][number]
export type AdminPerson = AdminProposal["author"]
export type ProposalQueueGroup = InferResponseType<Admin["proposals"]["$get"], 200>[number]
export type AdminSuggestion = InferResponseType<Admin["suggestions"]["$get"], 200>[number]
export type AdminContributor = InferResponseType<Admin["contributors"]["$get"], 200>[number]
export type AdminWerkRow = InferResponseType<Admin["werk"]["$get"], 200>[number]
export type ModerationEntry = InferResponseType<Admin["contributors"][":id"]["moderation"]["$get"], 200>[number]
