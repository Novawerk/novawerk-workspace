// The task board and GitHub, wired: a pull request's facts go to @nw/tasks, which decides what
// happens to the task; the replies it asks for (a comment, a size label) go out through the
// GitHub App (@nw/github); a merge refreshes the website's task pages. Used by
// POST /webhooks/github and the nightly /cron/github-sync.

import type { PullRequestFacts } from "@nw/github";
import { applyPullRequest, checkInactivity, deleteOldDeliveries, tasksWithWorkInFlight, type PullRequestOutcome } from "@nw/tasks";

import { revalidateWeb } from "./revalidate.js";
import type { AppDeps, Logger } from "./types.js";

/** The only repository the board works on. Tasks name it in `tasks.repo`. */
export const BOARD_REPO = "Novawerk/novawerk-workspace";

/** The website's cache tags a merge changes (the task pages and the contributors wall). */
export const BOARD_CACHE_TAGS = ["tasks", "contributors"];

/** How far back the nightly reconcile looks at pull requests. */
export const RECONCILE_DAYS = 7;

type Deps = Pick<AppDeps, "db" | "env" | "githubApi"> & { logger: Logger };

/** Apply one PR, post the replies (best effort: the task already moved), refresh the site on a merge. */
export async function handlePullRequest(
  deps: Deps,
  pr: PullRequestFacts,
  opts: { source: "webhook" | "reconcile"; action?: string },
): Promise<PullRequestOutcome> {
  const outcome = await applyPullRequest(deps.db, pr, { ...opts, webUrl: deps.env.publicUrls.webUrl });
  for (const reply of outcome.replies) {
    if (!deps.githubApi) {
      deps.logger.warn(`[github] no App credentials: not replying on ${pr.repo}#${pr.number} (${reply.kind})`);
      continue;
    }
    try {
      if (reply.kind === "comment") await deps.githubApi.comment(pr.repo, pr.number, reply.body);
      else await deps.githubApi.addLabels(pr.repo, pr.number, reply.labels);
    } catch (err) {
      deps.logger.error(`[github] ${reply.kind} on ${pr.repo}#${pr.number} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (outcome.result === "merged") await revalidateWeb(deps.env.webRevalidate, deps.logger, BOARD_CACHE_TAGS);
  return outcome;
}

export interface SyncReport {
  /** PRs looked at, and what they did. Null when the App isn't configured. */
  pullRequests: { checked: number; changed: Record<string, number> } | null;
  reminded: number[];
  released: number[];
  deliveriesDeleted: number;
}

/**
 * The nightly reconcile: the last week's PRs on our repository through the same rules as the
 * webhook (so a missed delivery is caught up, and nothing happens twice), then inactivity
 * reminders and releases, then old delivery ids.
 */
export async function syncWithGitHub(deps: Deps, now = new Date()): Promise<SyncReport> {
  let pullRequests: SyncReport["pullRequests"] = null;
  if (deps.githubApi) {
    const inFlight = new Set(await tasksWithWorkInFlight(deps.db));
    const recent = await deps.githubApi.recentPullRequests(BOARD_REPO, new Date(now.getTime() - RECONCILE_DAYS * 24 * 3_600_000));
    const changed: Record<string, number> = {};
    // Oldest first, so a PR that was closed and replaced is seen before its replacement.
    for (const pr of recent.filter((p) => p.taskNumber && inFlight.has(p.taskNumber)).reverse()) {
      const { result } = await handlePullRequest(deps, pr, { source: "reconcile" });
      if (result !== "unchanged" && result !== "ignored") changed[result] = (changed[result] ?? 0) + 1;
    }
    pullRequests = { checked: recent.length, changed };
  }
  const { reminded, released } = await checkInactivity(deps.db, now);
  return { pullRequests, reminded, released, deliveriesDeleted: await deleteOldDeliveries(deps.db, now) };
}
