// The task board's public reads, under /public: no session, the same answer for everyone.
// What may appear is decided in @nw/tasks (reads.ts): no drafts, no hidden post text, no decline
// notes, no private profiles, no emails. Agents may send a personal access token (optional):
// it raises nothing but its own budget, and a bad one is a 401.
//
//   GET /public/tasks?area=web,api&size=S&status=active&skills=react&q=…&sort=updated&cursor=…
//   GET /public/tasks/NW-42
//   GET /public/contributors?sort=newest|az&area=web&cursor=…   contributors and opted-in initiators
//   GET /public/contributors/:handle
//   GET /public/blocks                  every merged task, oldest first (the builders scene)
//   GET /public/initiators              opted-in Members who started a public project (flags in the scene)

import { createHmac } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { HANDLE_PATTERN, contributorListQuery, taskIdParam, taskListQuery } from "@nw/contracts";
import {
  getPublicContributor,
  getPublicTask,
  listPublicBlocks,
  listPublicContributors,
  listPublicInitiators,
  listPublicTasks,
} from "@nw/tasks";

import { notFound, notFoundIfInvalid, rejectInvalid } from "../http.js";
import type { TokenGate } from "../token-gate.js";
import type { ApiEnv, AppDeps } from "../types.js";

const handleParam = z.object({ handle: z.string().toLowerCase().max(40).regex(HANDLE_PATTERN) });

export function boardRoutes({ db, env }: AppDeps, gate: TokenGate) {
  // Keys the anonymous handles on /public/blocks: stable, and not reversible without the secret.
  const anonKey = createHmac("sha256", env.sessionSecret).update("nw-public-blocks").digest("hex");
  // A token is optional here: with one, it is checked and counted against its own budget.
  const token = gate.optional();
  return new Hono<ApiEnv>()
    .use("/blocks", token)
    .use("/initiators", token)
    .use("/tasks", token)
    .use("/tasks/*", token)
    .use("/contributors", token)
    .use("/contributors/*", token)
    .get("/blocks", async (c) => c.json(await listPublicBlocks(db, anonKey), 200))
    .get("/initiators", async (c) => c.json(await listPublicInitiators(db), 200))
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
