// /admin: the contributor task board's admin side (the Contributors pages). Admins only
// (requireAdmin in ../admin.ts). The rules are @nw/tasks'; a broken one answers with its status
// through app.onError. Every action writes a task event (the notices read those); nothing here
// sends mail.
//
//   GET    /admin/tasks?filter=              the task table            → AdminTaskRow[]
//   POST   /admin/tasks                      new draft (or publish)    → 201 AdminTaskDetail
//   GET    /admin/tasks/:id                  one task, everything      → AdminTaskDetail
//   PATCH  /admin/tasks/:id                  edit                      → AdminTaskDetail
//   POST   /admin/tasks/:id/publish|close|reopen                       → AdminTaskDetail
//   POST   /admin/tasks/:id/posts            a member's post           → 201 AdminTaskDetail
//   POST   /admin/tasks/:id/lock|unlock      the thread, with a reason → AdminTaskDetail
//   GET    /admin/proposals                  pending plans by task     → ProposalQueueGroup[]
//   POST   /admin/proposals/:id/choose       assign; others declined   → AdminTaskDetail
//   POST   /admin/proposals/:id/decline      private note              → AdminTaskDetail
//   GET    /admin/suggestions?sort=          the triage queue          → AdminSuggestion[]
//   POST   /admin/suggestions/:id/accept|duplicate|ask|decline         → AdminTaskDetail
//   GET    /admin/discussions?filter=        all / reported / hidden   → AdminPost[]
//   POST   /admin/discussions/:id/hide|unhide|keep                     → AdminPost
//   GET    /admin/contributors               everyone, with Werk       → AdminContributor[]
//   POST   /admin/contributors/:id/suspend|unsuspend                   → AdminContributor
//   GET    /admin/contributors/:id/moderation  every suspension and lift → history[]
//   GET    /admin/werk?contributor=          the ledger                → AdminWerkRow[]
//   POST   /admin/werk                       a new row (never an edit) → 201 AdminWerkRow

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import {
  ADMIN_TASK_FILTERS,
  DISCUSSION_FILTERS,
  SUGGESTION_SORTS,
  acceptSuggestionInput,
  adminTaskInput,
  adminTaskUpdateInput,
  askInfoInput,
  chooseProposalInput,
  declineProposalInput,
  declineSuggestionInput,
  duplicateSuggestionInput,
  formatTaskId,
  memberPostInput,
  moderationInput,
  taskIdParam,
  taskReasonInput,
  werkAdjustInput,
} from "@nw/contracts";
import { taskProposals, type Database } from "@nw/db";
import { readPrivate, stripImageMetadata } from "@nw/object-store";
import {
  TaskRuleError,
  acceptSuggestion,
  addMemberPost,
  adjustWerk,
  askForInfo,
  chooseProposal,
  createTask,
  declineProposal,
  dismissReports,
  getAdminPost,
  getAdminTask,
  listAdminContributors,
  listAdminTasks,
  listDiscussions,
  listProposalQueue,
  listSuggestions,
  listWerkLedger,
  moderationHistory,
  setContributorSuspended,
  setPostHidden,
  setThreadLocked,
  transitionTask,
  updateTask,
  forgetScreenshot,
  pendingScreenshot,
  publishScreenshot,
} from "@nw/tasks";

import { notFound, notFoundIfInvalid, rejectInvalid } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

const uuidParam = z.object({ id: z.uuid() });
const taskFilterQuery = z.object({ filter: z.enum(ADMIN_TASK_FILTERS).default("all") });
const suggestionSortQuery = z.object({ sort: z.enum(SUGGESTION_SORTS).default("oldest") });
const discussionQuery = z.object({ filter: z.enum(DISCUSSION_FILTERS).default("all") });
const werkQuery = z.object({ contributor: z.uuid().optional() });

/** A suggestion route on a task that isn't one is simply not found. */
async function suggestionOr404(db: Database, id: number) {
  const task = await getAdminTask(db, id);
  if (task.status !== "suggested") throw new TaskRuleError("not_found", `${task.id} isn't a suggestion waiting for triage`);
  return task;
}

async function proposalTask(db: Database, proposalId: string): Promise<number> {
  const [row] = await db.select({ taskId: taskProposals.taskId }).from(taskProposals).where(eq(taskProposals.id, proposalId));
  if (!row) throw new TaskRuleError("not_found", "No such proposal");
  return row.taskId;
}

export function boardAdminRoutes({ db, files, logger }: AdminDeps) {
  /**
   * Accepted: the screenshot goes public, without its metadata (EXIF, comments). The private one
   * is deleted. A failure leaves it private and attached for the next try; the accept stands.
   */
  const publishSuggestionScreenshot = async (taskId: number) => {
    const pathname = await pendingScreenshot(db, taskId);
    if (!pathname || !files?.ready.private || !files.ready.public) return;
    try {
      const file = await readPrivate(files, pathname);
      if (!file) return void (await forgetScreenshot(db, taskId));
      const clean = stripImageMetadata(file.body, file.contentType);
      const ext = file.contentType === "image/png" ? "png" : "jpg";
      const url = await files.putPublic(`tasks/${formatTaskId(taskId)}/screenshot-${randomUUID()}.${ext}`, clean, file.contentType);
      await publishScreenshot(db, taskId, url);
      await files.deletePrivate(pathname);
    } catch (err) {
      logger.error(`[admin] screenshot of ${formatTaskId(taskId)} not published:`, err instanceof Error ? err.message : err);
    }
  };
  /** Declined or a duplicate: the private screenshot goes. */
  const dropSuggestionScreenshot = async (taskId: number) => {
    const pathname = await forgetScreenshot(db, taskId);
    if (pathname && files?.ready.private) {
      await files.deletePrivate(pathname).catch((err: unknown) => logger.warn("[admin] screenshot delete failed:", err instanceof Error ? err.message : err));
    }
  };

  const tasksApp = new Hono<ApiEnv>()
    .get("/", zValidator("query", taskFilterQuery, rejectInvalid), async (c) =>
      c.json(await listAdminTasks(db, c.req.valid("query").filter), 200),
    )

    .post("/", zValidator("json", adminTaskInput, rejectInvalid), async (c) => {
      const task = await createTask(db, c.get("member").id, c.req.valid("json"));
      return c.json(await getAdminTask(db, task.id), 201);
    })

    .get("/:id", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) =>
      c.json(await getAdminTask(db, c.req.valid("param").id), 200),
    )

    .patch(
      "/:id",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", adminTaskUpdateInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await updateTask(db, c.get("member").id, id, c.req.valid("json"));
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post("/:id/publish", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
      const { id } = c.req.valid("param");
      await transitionTask(db, { taskId: id, action: "publish", actor: { kind: "member", id: c.get("member").id } });
      return c.json(await getAdminTask(db, id), 200);
    })

    .post(
      "/:id/close",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", taskReasonInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const actor = { kind: "member", id: c.get("member").id } as const;
        await transitionTask(db, { taskId: id, action: "close", actor, note: c.req.valid("json").reason });
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/reopen",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", taskReasonInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const actor = { kind: "member", id: c.get("member").id } as const;
        await transitionTask(db, { taskId: id, action: "reopen", actor, note: c.req.valid("json").reason });
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/lock",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setThreadLocked(db, c.get("member").id, id, true, c.req.valid("json").reason);
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/unlock",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setThreadLocked(db, c.get("member").id, id, false, c.req.valid("json").reason);
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/posts",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", memberPostInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await addMemberPost(db, c.get("member").id, id, c.req.valid("json"));
        return c.json(await getAdminTask(db, id), 201);
      },
    );

  const proposalsApp = new Hono<ApiEnv>()
    .get("/", async (c) => c.json(await listProposalQueue(db), 200))

    .post(
      "/:id/choose",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", chooseProposalInput, rejectInvalid),
      async (c) => {
        const task = await chooseProposal(db, {
          proposalId: c.req.valid("param").id,
          memberId: c.get("member").id,
          notes: c.req.valid("json").notes,
        });
        return c.json(await getAdminTask(db, task.id), 200);
      },
    )

    .post(
      "/:id/decline",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", declineProposalInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await declineProposal(db, c.get("member").id, id, c.req.valid("json").note);
        return c.json(await getAdminTask(db, await proposalTask(db, id)), 200);
      },
    );

  const suggestionsApp = new Hono<ApiEnv>()
    .get("/", zValidator("query", suggestionSortQuery, rejectInvalid), async (c) =>
      c.json(await listSuggestions(db, c.req.valid("query").sort), 200),
    )

    // Triage: the suggestion's screenshot while it is still private. Members only, never cached.
    .get("/:id/screenshot", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const pathname = await pendingScreenshot(db, id);
      const opened = pathname && files?.ready.private ? await files.openPrivate(pathname) : null;
      if (!opened) return c.json(notFound, 404);
      return new Response(opened.stream, {
        headers: { "Content-Type": opened.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    })

    .post(
      "/:id/accept",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", acceptSuggestionInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await suggestionOr404(db, id);
        await acceptSuggestion(db, c.get("member").id, id, c.req.valid("json"));
        await publishSuggestionScreenshot(id);
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/duplicate",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", duplicateSuggestionInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await suggestionOr404(db, id);
        const actor = { kind: "member", id: c.get("member").id } as const;
        await transitionTask(db, { taskId: id, action: "mark_duplicate", actor, duplicateOf: c.req.valid("json").of });
        await dropSuggestionScreenshot(id);
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/ask",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", askInfoInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await suggestionOr404(db, id);
        await askForInfo(db, c.get("member").id, id, c.req.valid("json").question);
        return c.json(await getAdminTask(db, id), 200);
      },
    )

    .post(
      "/:id/decline",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", declineSuggestionInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await suggestionOr404(db, id);
        const actor = { kind: "member", id: c.get("member").id } as const;
        await transitionTask(db, { taskId: id, action: "decline", actor, note: c.req.valid("json").note });
        await dropSuggestionScreenshot(id);
        return c.json(await getAdminTask(db, id), 200);
      },
    );

  const discussionsApp = new Hono<ApiEnv>()
    .get("/", zValidator("query", discussionQuery, rejectInvalid), async (c) => {
      return c.json(await listDiscussions(db, { filter: c.req.valid("query").filter }), 200);
    })

    .post(
      "/:id/hide",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setPostHidden(db, c.get("member").id, id, true, c.req.valid("json").reason);
        return c.json(await getAdminPost(db, id), 200);
      },
    )

    .post(
      "/:id/keep",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await dismissReports(db, c.get("member").id, id, c.req.valid("json").reason);
        return c.json(await getAdminPost(db, id), 200);
      },
    )

    .post(
      "/:id/unhide",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setPostHidden(db, c.get("member").id, id, false, c.req.valid("json").reason);
        return c.json(await getAdminPost(db, id), 200);
      },
    );

  const contributor = async (id: string) => {
    const [person] = await listAdminContributors(db, { id });
    if (!person) throw new TaskRuleError("not_found", "No such contributor");
    return person;
  };

  const contributorsApp = new Hono<ApiEnv>()
    .get("/", async (c) => c.json(await listAdminContributors(db), 200))

    .get("/:id/moderation", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      const { id } = c.req.valid("param");
      await contributor(id);
      return c.json(await moderationHistory(db, id), 200);
    })

    .post(
      "/:id/suspend",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setContributorSuspended(db, c.get("member").id, id, true, c.req.valid("json").reason);
        return c.json(await contributor(id), 200);
      },
    )

    .post(
      "/:id/unsuspend",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", moderationInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        await setContributorSuspended(db, c.get("member").id, id, false, c.req.valid("json").reason);
        return c.json(await contributor(id), 200);
      },
    );

  const werkApp = new Hono<ApiEnv>()
    .get("/", zValidator("query", werkQuery, rejectInvalid), async (c) => {
      const { contributor: contributorId } = c.req.valid("query");
      return c.json(await listWerkLedger(db, contributorId ? { contributorId } : {}), 200);
    })

    .post("/", zValidator("json", werkAdjustInput, rejectInvalid), async (c) => {
      const row = await adjustWerk(db, { ...c.req.valid("json"), memberId: c.get("member").id });
      const [listed] = await listWerkLedger(db, { id: row.id });
      return c.json(listed!, 201);
    });

  return { tasksApp, proposalsApp, suggestionsApp, discussionsApp, contributorsApp, werkApp };
}
