// /contrib: what a signed-in contributor does on the task board. Every route needs the
// `nw_contributor` cookie (src/contributor-auth.ts); a member's session doesn't count. The rules
// (GitHub linked, limits, whose proposal, which state) are @nw/tasks', and a broken one answers
// with its status through app.onError.
//
//   POST   /contrib/tasks/:id/proposals   propose a plan          → 201 PublicProposal
//   PATCH  /contrib/proposals/:id         edit your pending plan  → PublicProposal
//   DELETE /contrib/proposals/:id         withdraw it             → { ok }
//   GET    /contrib/me/proposals          yours, with private notes
//   POST   /contrib/tasks/:id/posts       post or reply           → 201 { id }
//   POST   /contrib/suggestions           suggest a task          → 201 { id, number }
//   PUT    /contrib/tasks/:id/vote        +1 a suggestion         → { ok }
//   DELETE /contrib/tasks/:id/vote        take it back            → { ok }
//   PATCH  /contrib/me/profile            → ContributorMe
//   DELETE /contrib/me { confirmHandle }  delete the account, sign out

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";

import {
  accountDeleteInput,
  formatTaskId,
  postInput,
  profileUpdateInput,
  proposalInput,
  proposalUpdateInput,
  suggestionInput,
  taskIdParam,
} from "@nw/contracts";
import {
  addPost,
  deleteContributor,
  myProposals,
  propose,
  suggestTask,
  toContributorMe,
  toPublicProposal,
  unvote,
  updateProfile,
  updateProposal,
  vote,
  withdrawProposal,
} from "@nw/tasks";

import { sessionCookieOptions } from "../auth.js";
import { CONTRIBUTOR_COOKIE, requireContributor } from "../contributor-auth.js";
import { notFoundIfInvalid, rejectInvalid } from "../http.js";
import type { ApiEnv, AppDeps } from "../types.js";

const MAX_BODY_BYTES = 64 * 1024;
const proposalIdParam = z.object({ id: z.uuid() });

export function contribRoutes({ db, env }: AppDeps) {
  return new Hono<ApiEnv>()
    .use("*", requireContributor(db, env.sessionSecret))
    .use("*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large" }, 413) }))

    .post(
      "/tasks/:id/proposals",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", proposalInput, rejectInvalid),
      async (c) => {
        const me = c.get("contributor");
        const row = await propose(db, me, c.req.valid("param").id, c.req.valid("json"));
        return c.json(toPublicProposal(row, me), 201);
      },
    )

    .patch(
      "/proposals/:id",
      zValidator("param", proposalIdParam, notFoundIfInvalid),
      zValidator("json", proposalUpdateInput, rejectInvalid),
      async (c) => {
        const me = c.get("contributor");
        const row = await updateProposal(db, me, c.req.valid("param").id, c.req.valid("json"));
        return c.json(toPublicProposal(row, me), 200);
      },
    )

    .delete("/proposals/:id", zValidator("param", proposalIdParam, notFoundIfInvalid), async (c) => {
      await withdrawProposal(db, c.get("contributor"), c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    })

    .get("/me/proposals", async (c) => c.json(await myProposals(db, c.get("contributor").id), 200))

    .post(
      "/tasks/:id/posts",
      zValidator("param", taskIdParam, notFoundIfInvalid),
      zValidator("json", postInput, rejectInvalid),
      async (c) => {
        const post = await addPost(db, c.get("contributor"), c.req.valid("param").id, c.req.valid("json"));
        return c.json({ id: post.id }, 201);
      },
    )

    .post("/suggestions", zValidator("json", suggestionInput, rejectInvalid), async (c) => {
      const task = await suggestTask(db, c.get("contributor"), c.req.valid("json"));
      return c.json({ id: formatTaskId(task.id), number: task.id }, 201);
    })

    .put("/tasks/:id/vote", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
      await vote(db, c.get("contributor"), c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    })
    .delete("/tasks/:id/vote", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
      await unvote(db, c.get("contributor"), c.req.valid("param").id);
      return c.json({ ok: true as const }, 200);
    })

    .patch("/me/profile", zValidator("json", profileUpdateInput, rejectInvalid), async (c) => {
      const row = await updateProfile(db, c.get("contributor").id, c.req.valid("json"));
      return c.json(toContributorMe(row), 200);
    })

    .delete("/me", zValidator("json", accountDeleteInput, rejectInvalid), async (c) => {
      await deleteContributor(db, c.get("contributor").id, c.req.valid("json").confirmHandle);
      deleteCookie(c, CONTRIBUTOR_COOKIE, sessionCookieOptions(c, 0));
      return c.json({ ok: true as const }, 200);
    });
}
