import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"

import type { AcceptSuggestionInput, AdminTaskFilter, DiscussionFilter, AdminTaskInput, AdminTaskUpdateInput, SuggestionSort, WerkAdjustInput } from "@nw/contracts"

import { boardSource } from "./board-source"
import type { AdminTaskDetail } from "./types"

export const boardKeys = {
  all: ["board"] as const,
  tasks: (filter: AdminTaskFilter) => ["board", "tasks", filter] as const,
  task: (id: string) => ["board", "task", id] as const,
  proposals: ["board", "proposals"] as const,
  suggestions: (sort: SuggestionSort) => ["board", "suggestions", sort] as const,
  suggestionScreenshot: (id: string) => ["board", "suggestion-screenshot", id] as const,
  discussions: (filter: DiscussionFilter) => ["board", "discussions", filter] as const,
  contributors: ["board", "contributors"] as const,
  werk: (contributorId?: string) => ["board", "werk", contributorId ?? "all"] as const,
}

export const boardTasksQueryOptions = (filter: AdminTaskFilter) =>
  queryOptions({ queryKey: boardKeys.tasks(filter), queryFn: () => boardSource.listTasks(filter) })

export const boardTaskQueryOptions = (id: string) =>
  queryOptions({ queryKey: boardKeys.task(id), queryFn: () => boardSource.getTask(id) })

export const proposalQueueQueryOptions = queryOptions({ queryKey: boardKeys.proposals, queryFn: () => boardSource.proposalQueue() })

export const suggestionsQueryOptions = (sort: SuggestionSort) =>
  queryOptions({ queryKey: boardKeys.suggestions(sort), queryFn: () => boardSource.listSuggestions(sort) })

export const suggestionScreenshotQueryOptions = (id: string) =>
  queryOptions({
    queryKey: boardKeys.suggestionScreenshot(id),
    queryFn: () => boardSource.getSuggestionScreenshot(id),
    gcTime: 0,
  })

export const discussionsQueryOptions = (filter: DiscussionFilter) =>
  queryOptions({ queryKey: boardKeys.discussions(filter), queryFn: () => boardSource.listDiscussions(filter) })

export const contributorsQueryOptions = queryOptions({ queryKey: boardKeys.contributors, queryFn: () => boardSource.listContributors() })

export const moderationHistoryQueryOptions = (id: string) =>
  queryOptions({ queryKey: ["board", "moderation", id] as const, queryFn: () => boardSource.moderationHistory(id) })

export const werkQueryOptions = (contributorId?: string) =>
  queryOptions({ queryKey: boardKeys.werk(contributorId), queryFn: () => boardSource.listWerk(contributorId) })

/**
 * After any board action: the task's own query takes the answer, and every list refetches (a
 * choice changes the queue, the table and the contributors' counts at once).
 */
function settle(queryClient: QueryClient, task?: AdminTaskDetail) {
  if (task) queryClient.setQueryData(boardKeys.task(task.id), task)
  void queryClient.invalidateQueries({
    queryKey: boardKeys.all,
    predicate: (q) => !task || q.queryKey[1] !== "task" || q.queryKey[2] !== task.id,
  })
}

/** One mutation hook per action; each returns the fresh task (or row) and refreshes the board. */
function useBoardMutation<I, O>(fn: (input: I) => Promise<O>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const task = result && typeof result === "object" && "events" in result ? (result as unknown as AdminTaskDetail) : undefined
      settle(queryClient, task)
    },
  })
}

export const useCreateTask = () => useBoardMutation((input: AdminTaskInput) => boardSource.createTask(input))
export const useUpdateTask = () =>
  useBoardMutation(({ id, patch }: { id: string; patch: AdminTaskUpdateInput }) => boardSource.updateTask(id, patch))
export const usePublishTask = () => useBoardMutation((id: string) => boardSource.publishTask(id))
export const useCloseTask = () => useBoardMutation(({ id, reason }: { id: string; reason: string }) => boardSource.closeTask(id, reason))
export const useReopenTask = () => useBoardMutation(({ id, reason }: { id: string; reason: string }) => boardSource.reopenTask(id, reason))
export const usePostOnTask = () =>
  useBoardMutation(({ id, body, replyTo }: { id: string; body: string; replyTo?: string }) => boardSource.postOnTask(id, body, replyTo))

export const useChooseProposal = () =>
  useBoardMutation(({ id, notes }: { id: string; notes: Record<string, string> }) => boardSource.chooseProposal(id, notes))
export const useDeclineProposal = () =>
  useBoardMutation(({ id, note }: { id: string; note: string }) => boardSource.declineProposal(id, note))

export const useAcceptSuggestion = () =>
  useBoardMutation(({ id, input }: { id: string; input: AcceptSuggestionInput }) => boardSource.acceptSuggestion(id, input))
export const useMarkDuplicate = () => useBoardMutation(({ id, of }: { id: string; of: string }) => boardSource.markDuplicate(id, of))
export const useAskForInfo = () =>
  useBoardMutation(({ id, question }: { id: string; question: string }) => boardSource.askForInfo(id, question))
export const useDeclineSuggestion = () =>
  useBoardMutation(({ id, note }: { id: string; note: string }) => boardSource.declineSuggestion(id, note))

export const useSetPostHidden = () =>
  useBoardMutation(({ id, hidden, reason }: { id: string; hidden: boolean; reason: string }) => boardSource.setPostHidden(id, hidden, reason))
export const useSetThreadLocked = () =>
  useBoardMutation(({ id, locked, reason }: { id: string; locked: boolean; reason: string }) =>
    boardSource.setThreadLocked(id, locked, reason),
  )
export const useKeepPost = () =>
  useBoardMutation(({ id, reason }: { id: string; reason: string }) => boardSource.keepPost(id, reason))
export const useSetSuspended = () =>
  useBoardMutation(({ id, suspended, reason }: { id: string; suspended: boolean; reason: string }) =>
    boardSource.setSuspended(id, suspended, reason),
  )

export const useAdjustWerk = () => useBoardMutation((input: WerkAdjustInput) => boardSource.adjustWerk(input))
