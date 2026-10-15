import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { dataSource } from "./data-source"
import type {
  ApplicationAcceptInput,
  ApplicationPatch,
  ApplicationStatus,
  DeliverableInput,
  DeliverablePatch,
  DocumentCreateInput,
  FinanceEntryInput,
  MemberApplication,
  MemberCreateInput,
  MemberSelfUpdateInput,
  MemberPatch,
  OutboxDraftInput,
  OutboxEmail,
  OutboxFilter,
  OutboxPatch,
  PartnerInput,
  PartnerPatch,
  Post,
  PostCreateInput,
  PostFilter,
  PostPatch,
  ProjectFileCreateInput,
  ProjectInput,
  ProjectPatch,
  ProjectSubmission,
  ProjectTeam,
  SubmissionAcceptInput,
  SubmissionPatch,
  SubmissionStatus,
} from "./types"

export const queryKeys = {
  me: ["me"] as const,
  members: ["members"] as const,
  submissions: {
    all: ["submissions"] as const,
    list: (status?: SubmissionStatus) => ["submissions", "list", status ?? "all"] as const,
    detail: (id: string) => ["submissions", "detail", id] as const,
  },
  applications: {
    all: ["applications"] as const,
    list: (status?: ApplicationStatus) => ["applications", "list", status ?? "all"] as const,
    detail: (id: string) => ["applications", "detail", id] as const,
  },
  transcript: (kind: "submission" | "application", id: string) => ["transcript", kind, id] as const,
  outbox: {
    all: ["outbox"] as const,
    list: (filter: OutboxFilter = {}) => ["outbox", "list", filter] as const,
    detail: (id: string) => ["outbox", "detail", id] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: ["projects", "list"] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
    /** Under "list", so whatever refreshes the project list refreshes the stage board too. */
    board: ["projects", "list", "board"] as const,
    history: (id: string) => ["projects", "history", id] as const,
    files: (id: string) => ["projects", "files", id] as const,
    deliverables: (id: string) => ["projects", "deliverables", id] as const,
  },
  posts: {
    all: ["posts"] as const,
    list: (filter: PostFilter = {}) => ["posts", "list", filter] as const,
    /** Under "list" so every post mutation refreshes it too. */
    board: ["posts", "list", "board"] as const,
    detail: (id: string) => ["posts", "detail", id] as const,
  },
  partners: ["partners"] as const,
  finance: ["finance"] as const,
  subscribers: ["subscribers"] as const,
  documents: ["documents"] as const,
  metrics: (days: number) => ["metrics", days] as const,
}

/** Refetch every list under a key (detail queries are set directly from mutation results). */
const invalidateLists = (queryClient: QueryClient, key: readonly string[]) =>
  queryClient.invalidateQueries({ queryKey: key, predicate: (query) => query.queryKey[1] === "list" })

// ─── Session and members ─────────────────────────────────────────────────────

/** GET /admin/me. A 401 means "not signed in"; the _app layout route redirects to /login. */
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.me,
  queryFn: () => dataSource.me(),
  staleTime: 5 * 60_000,
  retry: false,
})

/** GET /admin/members. Pickers filter to active ones. */
export const membersQueryOptions = queryOptions({
  queryKey: queryKeys.members,
  queryFn: () => dataSource.members(),
  staleTime: 60_000,
})

export function useCreateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MemberCreateInput) => dataSource.createMember(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members })
      // A new member may have become the Initiator of a project.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}

/** PATCH /admin/me: the member's own public profile. The answer replaces `me`. */
export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: MemberSelfUpdateInput) => dataSource.updateMe(patch),
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.me, me)
      void queryClient.invalidateQueries({ queryKey: queryKeys.members })
    },
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MemberPatch }) => dataSource.updateMember(id, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.members }),
  })
}

// ─── Project pitches ─────────────────────────────────────────────────────────

/** GET /admin/submissions?status= */
export const submissionsQueryOptions = (status?: SubmissionStatus) =>
  queryOptions({
    queryKey: queryKeys.submissions.list(status),
    queryFn: () => dataSource.listSubmissions(status),
  })

/** GET /admin/submissions/:id */
export const submissionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.submissions.detail(id),
    queryFn: () => dataSource.getSubmission(id),
  })

/** GET /admin/{submissions|applications}/:id/transcript — the Intake Agent chat, if there was one. */
export const transcriptQueryOptions = (kind: "submission" | "application", id: string) =>
  queryOptions({
    queryKey: queryKeys.transcript(kind, id),
    queryFn: () => (kind === "submission" ? dataSource.submissionTranscript(id) : dataSource.applicationTranscript(id)),
    // A sent conversation never changes.
    staleTime: Infinity,
  })

/** PATCH /admin/submissions/:id with { status?, reviewerId?, notes? } */
export function useUpdateSubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SubmissionPatch }) => dataSource.updateSubmission(id, patch),
    onSuccess: (updated: ProjectSubmission) => {
      queryClient.setQueryData(queryKeys.submissions.detail(updated.id), updated)
      void invalidateLists(queryClient, queryKeys.submissions.all)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.board })
    },
  })
}

/** POST /admin/submissions/:id/decline (and the short "not now" email, unless told not to). */
export function useDeclineSubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: boolean }) => dataSource.declineSubmission(id, { email }),
    onSuccess: ({ submission }) => {
      queryClient.setQueryData(queryKeys.submissions.detail(submission.id), submission)
      void invalidateLists(queryClient, queryKeys.submissions.all)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.board })
      void queryClient.invalidateQueries({ queryKey: queryKeys.outbox.all })
    },
  })
}

/** POST /admin/submissions/:id/accept → draft project. */
export function useAcceptSubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubmissionAcceptInput }) => dataSource.acceptSubmission(id, input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.outbox.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(result.submission.id) })
      void invalidateLists(queryClient, queryKeys.submissions.all)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}

// ─── Member applications ─────────────────────────────────────────────────────

/** GET /admin/applications?status= */
export const applicationsQueryOptions = (status?: ApplicationStatus) =>
  queryOptions({
    queryKey: queryKeys.applications.list(status),
    queryFn: () => dataSource.listApplications(status),
  })

/** GET /admin/applications/:id */
export const applicationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.applications.detail(id),
    queryFn: () => dataSource.getApplication(id),
  })

/** PATCH /admin/applications/:id with { status?, reviewerId?, memberId?, notes? } */
export function useUpdateApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) => dataSource.updateApplication(id, patch),
    onSuccess: (updated: MemberApplication) => {
      queryClient.setQueryData(queryKeys.applications.detail(updated.id), updated)
      void invalidateLists(queryClient, queryKeys.applications.all)
    },
  })
}

/** POST /admin/applications/:id/accept → new or linked member. */
export function useAcceptApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplicationAcceptInput }) =>
      dataSource.acceptApplication(id, input),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.applications.detail(result.application.id), result.application)
      void invalidateLists(queryClient, queryKeys.applications.all)
      void queryClient.invalidateQueries({ queryKey: queryKeys.members })
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}

// ─── Outbox ──────────────────────────────────────────────────────────────────

/** GET /admin/outbox?status=&relatedTable=&relatedId= */
export const outboxQueryOptions = (filter: OutboxFilter = {}) =>
  queryOptions({
    queryKey: queryKeys.outbox.list(filter),
    queryFn: () => dataSource.listOutbox(filter),
  })

/** GET /admin/outbox/:id */
export const outboxEmailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.outbox.detail(id),
    queryFn: () => dataSource.getOutbox(id),
  })

/** A mutation that answers with the outbox row: cache it, refresh the lists. */
function useOutboxMutation<V>(fn: (vars: V) => Promise<OutboxEmail>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (email) => {
      queryClient.setQueryData(queryKeys.outbox.detail(email.id), email)
      void invalidateLists(queryClient, queryKeys.outbox.all)
    },
  })
}

/** POST /admin/outbox: a member's draft, queued as pending. */
export const useDraftEmail = () => useOutboxMutation((input: OutboxDraftInput) => dataSource.draftEmail(input))

/** PATCH /admin/outbox/:id while pending. */
export const useUpdateOutbox = () =>
  useOutboxMutation(({ id, patch }: { id: string; patch: OutboxPatch }) => dataSource.updateOutbox(id, patch))

/** POST /admin/outbox/:id/approve → approve, then send if the API has a Resend key. */
export function useApproveOutbox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.approveOutbox(id),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.outbox.detail(result.email.id), result.email)
      void invalidateLists(queryClient, queryKeys.outbox.all)
      // A partner's "last touch" moves when their email goes out.
      if (result.email.relatedTable === "partners") void queryClient.invalidateQueries({ queryKey: queryKeys.partners })
    },
  })
}

/** POST /admin/outbox/:id/reject */
export const useRejectOutbox = () => useOutboxMutation((id: string) => dataSource.rejectOutbox(id))

// ─── Portfolio ───────────────────────────────────────────────────────────────

/** GET /admin/projects (every status, website order). */
export const projectsQueryOptions = queryOptions({
  queryKey: queryKeys.projects.list,
  queryFn: () => dataSource.listProjects(),
})

/** GET /admin/projects/:id */
export const projectQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => dataSource.getProject(id),
  })

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => dataSource.createProject(input),
    onSuccess: ({ project }) => {
      queryClient.setQueryData(queryKeys.projects.detail(project.id), project)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) => dataSource.updateProject(id, patch),
    onSuccess: ({ project }) => {
      queryClient.setQueryData(queryKeys.projects.detail(project.id), project)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list })
      // A status change adds a line to the timeline and may plan posts.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.history(project.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.posts.all })
    },
  })
}

export function useSetProjectTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, team }: { id: string; team: ProjectTeam }) => dataSource.setProjectTeam(id, team),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deleteProject(id),
    onSuccess: () => {
      // The detail cache is left alone: the editor that showed it is navigating away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list })
      // The pitch it came from loses its project link.
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all })
    },
  })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** GET /admin/projects/board — pitches and projects by stage. */
export const projectBoardQueryOptions = queryOptions({
  queryKey: queryKeys.projects.board,
  queryFn: () => dataSource.projectBoard(),
})

/** GET /admin/projects/:id/history */
export const projectHistoryQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.projects.history(id),
    queryFn: () => dataSource.projectHistory(id),
  })

/** GET /admin/projects/:id/files */
export const projectFilesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: queryKeys.projects.files(projectId),
    queryFn: () => dataSource.listProjectFiles(projectId),
  })

/** Record an uploaded project file, or delete one; the list refetches. */
export function useProjectFiles(projectId: string) {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.projects.files(projectId) })
  return {
    add: useMutation({
      mutationFn: (input: ProjectFileCreateInput) => dataSource.addProjectFile(projectId, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (fileId: number) => dataSource.deleteProjectFile(projectId, fileId), onSuccess: refresh }),
  }
}

/** GET /admin/projects/:id/deliverables */
export const deliverablesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: queryKeys.projects.deliverables(projectId),
    queryFn: () => dataSource.listDeliverables(projectId),
  })

/** Add, change or delete one deliverable; the project's list refetches. */
export function useSaveDeliverable(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      vars: { input: DeliverableInput } | { id: string; patch: DeliverablePatch } | { id: string; remove: true },
    ): Promise<void> => {
      if ("input" in vars) await dataSource.addDeliverable(projectId, vars.input)
      else if ("remove" in vars) await dataSource.deleteDeliverable(projectId, vars.id)
      else await dataSource.updateDeliverable(projectId, vars.id, vars.patch)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.projects.deliverables(projectId) }),
  })
}

// ─── Posts ───────────────────────────────────────────────────────────────────

/** GET /admin/posts?status=&projectId= */
export const postsQueryOptions = (filter: PostFilter = {}) =>
  queryOptions({
    queryKey: queryKeys.posts.list(filter),
    queryFn: () => dataSource.listPosts(filter),
  })

/** GET /admin/posts/board — the swimlanes. */
export const postBoardQueryOptions = queryOptions({
  queryKey: queryKeys.posts.board,
  queryFn: () => dataSource.postBoard(),
})

/**
 * GET /admin/posts/:id. While the promo agent writes a draft (`draftRequestedAt`), poll every few
 * seconds so the new text shows up on its own.
 */
export const postQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => dataSource.getPost(id),
    refetchInterval: (query) => (query.state.data?.draftRequestedAt ? 5000 : false),
  })

/** A mutation that answers with the post: cache it, refresh the lists. */
function usePostMutation<V>(fn: (vars: V) => Promise<Post>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (post) => {
      queryClient.setQueryData(queryKeys.posts.detail(post.id), post)
      void invalidateLists(queryClient, queryKeys.posts.all)
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.board })
    },
  })
}

export const useUpdatePost = () =>
  usePostMutation(({ id, patch }: { id: string; patch: PostPatch }) => dataSource.updatePost(id, patch))
export const useApprovePost = () => usePostMutation((id: string) => dataSource.approvePost(id))
export const useSkipPost = () => usePostMutation((id: string) => dataSource.skipPost(id))
export const useRestorePost = () => usePostMutation((id: string) => dataSource.restorePost(id))
/** "We posted it" → published; and back. */
export const usePublishPost = () => usePostMutation((id: string) => dataSource.publishPost(id))
export const useUnpublishPost = () => usePostMutation((id: string) => dataSource.unpublishPost(id))

/** POST /admin/posts/:id/draft — the agent writes it; the detail query polls until it lands. */
export function useRequestDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.requestDraft(id),
    onSuccess: ({ post }) => {
      queryClient.setQueryData(queryKeys.posts.detail(post.id), post)
      void invalidateLists(queryClient, queryKeys.posts.all)
    },
  })
}

/** POST /admin/posts — add one by hand: any kind, with a project or about Novawerk itself. */
export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PostCreateInput) => dataSource.createPost(input),
    onSuccess: ({ post }) => {
      queryClient.setQueryData(queryKeys.posts.detail(post.id), post)
      void invalidateLists(queryClient, queryKeys.posts.all)
    },
  })
}

// ─── Partners, finance, subscribers, documents ───────────────────────────────

export const partnersQueryOptions = queryOptions({
  queryKey: queryKeys.partners,
  queryFn: () => dataSource.listPartners(),
})

export function useSavePartner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; patch: PartnerPatch } | { input: PartnerInput }) =>
      "input" in vars ? dataSource.createPartner(vars.input) : dataSource.updatePartner(vars.id, vars.patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.partners }),
  })
}

export function useDeletePartner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dataSource.deletePartner(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.partners })
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance })
    },
  })
}

export const financeQueryOptions = queryOptions({
  queryKey: queryKeys.finance,
  queryFn: () => dataSource.listFinance(),
})

export function useAddFinanceEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: FinanceEntryInput) => dataSource.addFinanceEntry(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.finance }),
  })
}

export const subscribersQueryOptions = queryOptions({
  queryKey: queryKeys.subscribers,
  queryFn: () => dataSource.listSubscribers(),
})

export const documentsQueryOptions = queryOptions({
  queryKey: queryKeys.documents,
  queryFn: () => dataSource.listDocuments(),
})

/** POST /admin/documents after the file is uploaded (see ./uploads.ts). */
export function useCreateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DocumentCreateInput) => dataSource.createDocument(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => dataSource.deleteDocument(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      // Ledger entries lose their receipt link.
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance })
    },
  })
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** GET /admin/metrics?days= */
export const metricsQueryOptions = (days: number) =>
  queryOptions({
    queryKey: queryKeys.metrics(days),
    queryFn: () => dataSource.metrics(days),
    staleTime: 60_000,
  })
