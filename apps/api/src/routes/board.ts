// The task board's public reads, under /public: no session, the same answer for everyone.
// What may appear is decided in @nw/tasks (reads.ts): no drafts, no hidden post text, no decline
// notes, no private profiles, no emails.
//
//   GET /public/tasks?area=web,api&size=S&status=active&skills=react&q=…&sort=updated&cursor=…
//   GET /public/tasks/NW-42
//   GET /public/contributors?sort=newest|az&area=web
//   GET /public/contributors/:handle

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { HANDLE_PATTERN, contributorListQuery, taskIdParam, taskListQuery } from "@nw/contracts";
import { getPublicContributor, getPublicTask, listPublicContributors, listPublicTasks } from "@nw/tasks";

import { notFound, notFoundIfInvalid, rejectInvalid } from "../http.js";
import type { ApiEnv, AppDeps } from "../types.js";

const handleParam = z.object({ handle: z.string().toLowerCase().max(40).regex(HANDLE_PATTERN) });

export function boardRoutes({ db }: AppDeps) {
  return new Hono<ApiEnv>()
    .get("/tasks", zValidator("query", taskListQuery, rejectInvalid), async (c) =>
      c.json(await listPublicTasks(db, c.req.valid("query")), 200),
    )
    .get("/tasks/:id", zValidator("param", taskIdParam, notFoundIfInvalid), async (c) => {
      const task = await getPublicTask(db, c.req.valid("param").id);
      return task ? c.json(task, 200) : c.json(notFound, 404);
    })
    .get("/contributors", zValidator("query", contributorListQuery, rejectInvalid), async (c) =>
      c.json(await listPublicContributors(db, c.req.valid("query")), 200),
    )
    .get("/contributors/:handle", zValidator("param", handleParam, notFoundIfInvalid), async (c) => {
      const profile = await getPublicContributor(db, c.req.valid("param").handle);
      return profile ? c.json(profile, 200) : c.json(notFound, 404);
    });
}
