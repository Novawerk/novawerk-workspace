// /contrib: what a signed-in member does on the task board, from the browser (the session
// cookie, src/auth.ts) or through a personal access token (`Authorization: Bearer nwt_…`,
// src/token-gate.ts). The rules
// (GitHub linked, limits, whose proposal, which state) are @nw/tasks', and a broken one answers
// with its status through app.onError.
//
// [scope] is what a token needs; "browser" routes refuse tokens; every route has one of the two
// (a test checks). Through a token a proposal is a draft until its person confirms it, a token
// edits and discards drafts only, and proposals, posts, suggestions, PR links, releases and
// extensions are recorded as "via agent · <token name>". Browser writes must come from the
// website's origins or carry JSON.
//
//   GET    /contrib/me                    who I am (no email through a token)  [tasks:read]
//   GET    /contrib/me/proposals          mine, with private notes and drafts  [tasks:read]
//   GET    /contrib/me/tasks              what I hold, my pending proposals    [tasks:read]
//   GET    /contrib/me/votes              the suggestions I +1'd → { taskIds } [tasks:read]
//   GET    /contrib/tasks/:id/guide       the contribution guide (assignee)    [tasks:read]
//   POST   /contrib/tasks/:id/proposals   propose a plan → 201 PublicProposal  [proposals:write]
//   PATCH  /contrib/proposals/:id         edit your pending plan or draft      [proposals:write]
//   DELETE /contrib/proposals/:id         withdraw it                          [proposals:write]
//   POST   /contrib/proposals/:id/confirm an agent's draft counts from now     browser
//   POST   /contrib/tasks/:id/posts       post or reply → 201 { id }           [discussion:write]
//   POST   /contrib/posts/:id/report      report a post { reason? }            [discussion:write]
//   POST   /contrib/uploads/suggestion-screenshot  a private upload ticket [suggestions:write]
//   POST   /contrib/suggestions           suggest a task → 201 { id, number }  [suggestions:write]
//   PUT    /contrib/tasks/:id/vote        +1 a suggestion                      [suggestions:write]
//   DELETE /contrib/tasks/:id/vote        take it back                         [suggestions:write]
//   POST   /contrib/tasks/:id/pr          link a PR by hand { url }, checked   [tasks:work]
//                                         on GitHub (503 without the App)
//   POST   /contrib/tasks/:id/release     give it back, body optional          [tasks:work]
//   POST   /contrib/tasks/:id/extend      "I need a week more", once           [tasks:work]
//   PATCH  /contrib/me/profile            → ContributorMe                      [profile:write]*
//   GET    /contrib/tokens                my tokens                            browser
//   POST   /contrib/tokens                a new one → 201 CreatedToken         browser
//   DELETE /contrib/tokens/:id            revoke it                            browser
//   DELETE /contrib/me { confirmHandle }  delete the account, sign out         browser
//
// * Through a token the profile's handle, visibility (public, onWall) and pledge stay browser-only.

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie } from "hono/cookie";
import { z } from "zod";

import {
  accountDeleteInput,
  formatTaskId,
  postInput,
  prLinkInput,
  profileUpdateInput,
  proposalInput,
  proposalUpdateInput,
  releaseInput,
  reportInput,
  suggestionInput,
  taskIdParam,
  tokenCreateInput,
  MAX_SUGGESTION_SCREENSHOT_BYTES,
  SUGGESTION_SCREENSHOT_TYPES,
  suggestionScreenshotUploadInput,
  type ProposalResult,
  type SuggestionScreenshotTicket,
} from "@nw/contracts";
import { safeFilename, type Files } from "@nw/object-store";
import type { Member, TaskProposal } from "@nw/db";
import { parsePullRequestUrl } from "@nw/github";
import {
  TaskRuleError,
  addPost,
  checkCanLinkPr,
  confirmDraftProposal,
  createToken,
  deleteContributor,
  extendTask,
  guideFor,
  linkPrByHand,
  listTokens,
  myProposals,
  myTasks,
  myVotes,
  propose,
  releaseHeldTask,
  reportPost,
  revokeToken,
  screenshotFolderOf,
  suggestTask,
  toContributorMe,
  toPublicProposal,
  unvote,
  updateProfile,
  updateProposal,
  vote,
  withdrawProposal,
} from "@nw/tasks";

import { SESSION_COOKIE, currentAccount, sessionCookieOptions } from "../auth.js";
import { tellChat, tellChatProfile } from "../chat-sso.js";
import { FixedWindowLimiter } from "../intake-chat/rate-limit.js";
import { issuesFrom, notFoundIfInvalid, rejectInvalid, validationFailed } from "../http.js";
import { revalidateWeb } from "../revalidate.js";
import { contributorOrToken, scope, sessionOnly, viaOf, type TokenGate } from "../token-gate.js";
import type { ApiEnv, AppDeps } from "../types.js";

const MAX_BODY_BYTES = 64 * 1024;
/** Proposals, posts and tokens are uuids. */
const uuidParam = z.object({ id: z.uuid() });

/** Screenshot tickets per contributor per hour (in-memory, per instance). */
export const SCREENSHOT_TICKETS_PER_HOUR = 10;

/** A screenshot sent with a suggestion: the caller's own upload, there, a PNG or JPEG under 2 MB. */
async function checkScreenshot(files: Files | undefined, contributorId: string, pathname: string): Promise<void> {
  const field = "screenshot";
  if (!files?.ready.private) throw new TaskRuleError("invalid", "Screenshots are off right now. Send it without one.", field);
  if (!pathname.startsWith(screenshotFolderOf(contributorId))) throw new TaskRuleError("invalid", "That isn't your upload", field);
  const stored = await files.statPrivate(pathname);
  if (!stored) throw new TaskRuleError("invalid", "That upload didn't work. Attach the screenshot again.", field);
  if (stored.size > MAX_SUGGESTION_SCREENSHOT_BYTES || !(SUGGESTION_SCREENSHOT_TYPES as readonly string[]).includes(stored.contentType)) {
    throw new TaskRuleError("invalid", "A PNG or JPEG up to 2 MB", field);
  }
}

/** Your own view of a proposal you just wrote: says whether it is a draft. */
function proposalResult(row: TaskProposal, me: Member, viaAgent: string | null): ProposalResult {
  return { ...toPublicProposal(row, me, viaAgent), status: row.status as ProposalResult["status"], draft: row.status === "draft" };
}

/** Profile fields a token may not change. */
const BROWSER_ONLY_PROFILE = ["handle", "public", "onWall", "acceptPledge"] as const;

export function contribRoutes({ db, env, githubApi, files, logger = console }: AppDeps, gate: TokenGate, origins: readonly string[]) {
  // A saved profile or a removed person shows at once on /u/<handle> and the wall.
  const refreshProfiles = () => revalidateWeb(env.webRevalidate, logger, ["contributors"]);
  const session = (c: Parameters<typeof getCookie>[0]) => currentAccount(db, getCookie(c, SESSION_COOKIE), env.sessionSecret);
  const screenshotTickets = new FixedWindowLimiter(SCREENSHOT_TICKETS_PER_HOUR, 60 * 60_000);
  return (
    new Hono<ApiEnv>()
      .use("*", contributorOrToken(gate, session, origins))
      .use("*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large" }, 413) }))

      // ─── Reading my own things ──────────────────────────────────────────────
      .get("/me", scope("tasks:read"), (c) => {
        const me = toContributorMe(c.get("contributor"));
        return c.json(c.get("token") ? { ...me, email: null, notifyEmail: null } : me, 200);
      })
      .get("/me/proposals", scope("tasks:read"), async (c) => c.json(await myProposals(db, c.get("contributor").id), 200))
      .get("/me/tasks", scope("tasks:read"), async (c) => c.json(await myTasks(db, c.get("contributor").id), 200))
      .get("/me/votes", scope("tasks:read"), async (c) => c.json({ taskIds: await myVotes(db, c.get("contributor").id) }, 200))
      .get("/tasks/:id/guide", scope("tasks:read"), zValidator("param", taskIdParam, notFoundIfInvalid), async (c) =>
        c.json(await guideFor(db, c.get("contributor"), c.req.valid("param").id), 200),
      )

      // ─── Proposals ──────────────────────────────────────────────────────────
      .post(
        "/tasks/:id/proposals",
        scope("proposals:write"),
        zValidator("param", taskIdParam, notFoundIfInvalid),
        zValidator("json", proposalInput, rejectInvalid),
        async (c) => {
          const me = c.get("contributor");
          const row = await propose(db, me, c.req.valid("param").id, c.req.valid("json"), undefined, viaOf(c));
          return c.json(proposalResult(row, me, c.get("token")?.name ?? null), 201);
        },
      )
      .patch(
        "/proposals/:id",
        scope("proposals:write"),
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", proposalUpdateInput, rejectInvalid),
        async (c) => {
          const me = c.get("contributor");
          const row = await updateProposal(db, me, c.req.valid("param").id, c.req.valid("json"), new Date(), viaOf(c));
          return c.json(proposalResult(row, me, c.get("token")?.name ?? null), 200);
        },
      )
      .delete("/proposals/:id", scope("proposals:write"), zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        await withdrawProposal(db, c.get("contributor"), c.req.valid("param").id, new Date(), viaOf(c));
        return c.json({ ok: true as const }, 200);
      })
      .post("/proposals/:id/confirm", sessionOnly, zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const me = c.get("contributor");
        const row = await confirmDraftProposal(db, me, c.req.valid("param").id);
        return c.json(proposalResult(row, me, null), 200);
      })

      // ─── Discussion ─────────────────────────────────────────────────────────
      .post(
        "/tasks/:id/posts",
        scope("discussion:write"),
        zValidator("param", taskIdParam, notFoundIfInvalid),
        zValidator("json", postInput, rejectInvalid),
        async (c) => {
          const post = await addPost(db, c.get("contributor"), c.req.valid("param").id, c.req.valid("json"), undefined, viaOf(c));
          return c.json({ id: post.id }, 201);
        },
      )
      .post(
        "/posts/:id/report",
        scope("discussion:write"),
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", reportInput, rejectInvalid),
        async (c) => {
          await reportPost(db, c.get("contributor"), c.req.valid("param").id, c.req.valid("json").reason);
          return c.json({ ok: true as const }, 200);
        },
      )

      // ─── Suggestions and +1 ─────────────────────────────────────────────────
      // A screenshot for a suggestion: a ticket for one upload to the PRIVATE store, under the
      // caller's own folder. It shows publicly only once a member accepts the suggestion.
      .post(
        "/uploads/suggestion-screenshot",
        scope("suggestions:write"),
        zValidator("json", suggestionScreenshotUploadInput, rejectInvalid),
        async (c) => {
          if (!files?.ready.private) return c.json({ error: "Screenshots are off right now." }, 503);
          const me = c.get("contributor");
          if (me.suspendedAt) throw new TaskRuleError("suspended", "This account is suspended");
          if (!screenshotTickets.take(me.id)) throw new TaskRuleError("rate_limited", "Up to 10 screenshots an hour. Try again later.");
          const { filename, contentType } = c.req.valid("json");
          const ticket = await files.uploadTicket("private", {
            pathname: `${screenshotFolderOf(me.id)}${randomUUID()}-${safeFilename(filename)}`,
            contentTypes: [contentType],
            maxBytes: MAX_SUGGESTION_SCREENSHOT_BYTES,
          });
          return c.json({ token: ticket.token, pathname: ticket.pathname } satisfies SuggestionScreenshotTicket, 200);
        },
      )
      .post("/suggestions", scope("suggestions:write"), zValidator("json", suggestionInput, rejectInvalid), async (c) => {
        const input = c.req.valid("json");
        if (input.screenshot) await checkScreenshot(files, c.get("contributor").id, input.screenshot.pathname);
        const task = await suggestTask(db, c.get("contributor"), input, new Date(), viaOf(c));
        return c.json({ id: formatTaskId(task.id), number: task.id }, 201);
      })
      .put("/tasks/:id/vote", scope("suggestions:write"), zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
        await vote(db, c.get("contributor"), c.req.valid("param").id);
        return c.json({ ok: true as const }, 200);
      })
      .delete("/tasks/:id/vote", scope("suggestions:write"), zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
        await unvote(db, c.get("contributor"), c.req.valid("param").id);
        return c.json({ ok: true as const }, 200);
      })

      // ─── The task I hold ────────────────────────────────────────────────────
      .post(
        "/tasks/:id/pr",
        scope("tasks:work"),
        zValidator("param", taskIdParam, notFoundIfInvalid),
        zValidator("json", prLinkInput, rejectInvalid),
        async (c) => {
          // The PR as GitHub sees it: open, by the assignee's account, naming this task.
          const ref = parsePullRequestUrl(c.req.valid("json").url);
          if (!ref) throw new TaskRuleError("invalid", "A pull request link", "url");
          // Their task, in progress, a PR on its repository: only then ask GitHub.
          await checkCanLinkPr(db, c.get("contributor"), c.req.valid("param").id, ref.repo);
          if (!githubApi) {
            return c.json({ error: 'Linking by hand isn\'t available yet. Put "Task: NW-<n>" in your pull request\'s description instead.' }, 503);
          }
          const pr = await githubApi.getPullRequest(ref.repo, ref.number);
          if (!pr) throw new TaskRuleError("invalid", "We can't find that pull request", "url");
          const task = await linkPrByHand(db, c.get("contributor"), c.req.valid("param").id, pr, viaOf(c));
          return c.json({ ok: true as const, status: task.status, prUrl: task.prUrl }, 200);
        },
      )
      .post("/tasks/:id/release", scope("tasks:work"), zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
        // The body is optional: no body, `{}` and `{ reason }` all work.
        const text = await c.req.text();
        let body: unknown = {};
        try {
          body = text.trim() ? JSON.parse(text) : {};
        } catch {
          return c.json(validationFailed({ _form: ["That isn't JSON"] }), 400);
        }
        const input = releaseInput.safeParse(body);
        if (!input.success) return c.json(validationFailed(issuesFrom(input.error)), 400);
        await releaseHeldTask(db, c.get("contributor"), c.req.valid("param").id, input.data.reason, viaOf(c));
        return c.json({ ok: true as const }, 200);
      })
      .post("/tasks/:id/extend", scope("tasks:work"), zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
        const task = await extendTask(db, c.get("contributor"), c.req.valid("param").id, new Date(), viaOf(c));
        return c.json({ ok: true as const, extendedAt: task.extendedAt!.toISOString() }, 200);
      })

      // ─── Profile and account ────────────────────────────────────────────────
      .patch("/me/profile", scope("profile:write"), zValidator("json", profileUpdateInput, rejectInvalid), async (c) => {
        const patch = c.req.valid("json");
        if (c.get("token")) {
          const field = BROWSER_ONLY_PROFILE.find((f) => patch[f] !== undefined);
          if (field) throw new TaskRuleError("forbidden", `A token can't change ${field}. Use novawerk.io in your browser.`, field);
        }
        const row = await updateProfile(db, c.get("contributor").id, patch);
        await refreshProfiles();
        // The chat shows the profile too: name, @handle, picture, bio, and Werk when public.
        await tellChatProfile({ db, env, logger }, row.id);
        const me = toContributorMe(row);
        return c.json(c.get("token") ? { ...me, email: null, notifyEmail: null } : me, 200);
      })
      .delete("/me", sessionOnly, zValidator("json", accountDeleteInput, rejectInvalid), async (c) => {
        const me = c.get("contributor");
        await deleteContributor(db, me.id, c.req.valid("json").confirmHandle);
        // The chat goes with the account (NB-ADR-0014).
        await tellChat(env.chatSso, logger, me, "deleted");
        // Their screenshots go too (best effort: the nightly cleanup catches the rest). The account
        // is already gone, so nothing here may stop the cookie being cleared.
        if (files?.ready.private) {
          try {
            await Promise.all((await files.listPrivate(screenshotFolderOf(me.id))).map((f) => files.deletePrivate(f.pathname)));
          } catch (err) {
            logger.warn("[contrib] screenshot cleanup on delete failed:", err instanceof Error ? err.message : err);
          }
        }
        await refreshProfiles();
        deleteCookie(c, SESSION_COOKIE, sessionCookieOptions(c, 0));
        return c.json({ ok: true as const }, 200);
      })

      // ─── Tokens (browser only) ──────────────────────────────────────────────
      .get("/tokens", sessionOnly, async (c) => c.json(await listTokens(db, c.get("contributor").id), 200))
      .post("/tokens", sessionOnly, zValidator("json", tokenCreateInput, rejectInvalid), async (c) =>
        c.json(await createToken(db, c.get("contributor").id, c.req.valid("json")), 201),
      )
      .delete("/tokens/:id", sessionOnly, zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        await revokeToken(db, c.get("contributor").id, c.req.valid("param").id);
        return c.json({ ok: true as const }, 200);
      })
  );
}
