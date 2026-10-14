// /admin/metrics: the admin panel's Metrics page. Traffic and the intake funnel from
// analytics_events, the inbox from its own tables. See docs/analytics.md.

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { metricsQuery, type AdminMetrics } from "@nw/contracts";

import { loadMetrics } from "../../analytics/metrics.js";
import { rejectInvalid } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

export function metricsRoutes({ db }: AdminDeps) {
  return new Hono<ApiEnv>().get("/", zValidator("query", metricsQuery, rejectInvalid), async (c) => {
    const metrics: AdminMetrics = await loadMetrics(db, c.req.valid("query").days);
    return c.json(metrics, 200);
  });
}
