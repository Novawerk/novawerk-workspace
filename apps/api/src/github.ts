// The task board and GitHub, wired: a pull request's facts go to @nw/tasks, which decides what
// happens to the task; the replies it asks for (a comment, a size label) go out through the
// GitHub App (@nw/github); a merge refreshes the website's task pages. Used by
// POST /webhooks/github and the nightly /cron/github-sync.

import { parsePullRequestUrl, type PullRequestFacts } from "@nw/github";
import {
  applyPullRequest,
  checkInactivity,
  isRetryable,
  deleteOldDeliveries,
  reconcileLinkedPullRequest,
  tasksInReview,
  tasksWithWorkInFlight,
  type PullRequestOutcome,
} from "@nw/tasks";

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
  // A deadlock with a member's action on the same person or task: run it again (GitHub won't).
  let outcome: PullRequestOutcome;
  for (let attempt = 1; ; attempt++) {
    try {
      outcome = await applyPullRequest(deps.db, pr, { ...opts, webUrl: deps.env.publicUrls.webUrl });
      break;
    } catch (err) {
      if (!isRetryable(err) || attempt >= 3) throw err;
      deps.logger.warn(`[github] ${pr.repo}#${pr.number}: retrying after a deadlock (${attempt})`);
    }
  }
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
  /** GitHub calls that failed (bad key, rate limit, 5xx). The rest of the sync still ran. */
  errors: string[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The nightly reconcile, then the rest, each step on its own so a GitHub failure never skips
 * the inactivity check or the cleanup:
 * 1. the last week's PRs through the same rules as the webhook (a missed delivery is caught up;
 *    nothing happens twice);
 * 2. every task in review against its PR as GitHub sees it now: closed, gone, or not counting
 *    (another author, no longer naming the task) puts it back to assigned;
 * 3. inactivity reminders and releases; 4. old delivery ids.
 */
export async function syncWithGitHub(deps: Deps, now = new Date()): Promise<SyncReport> {
  const errors: string[] = [];
  let pullRequests: SyncReport["pullRequests"] = null;
  if (deps.githubApi) {
    const api = deps.githubApi;
    const changed: Record<string, number> = {};
    const count = (result: string) => {
      if (result !== "unchanged" && result !== "ignored") changed[result] = (changed[result] ?? 0) + 1;
    };
    let checked = 0;
    try {
      const inFlight = new Set(await tasksWithWorkInFlight(deps.db));
      const recent = await api.recentPullRequests(BOARD_REPO, new Date(now.getTime() - RECONCILE_DAYS * 24 * 3_600_000));
      checked = recent.length;
      // Oldest first, so a PR that was closed and replaced is seen before its replacement.
      for (const pr of recent.filter((p) => p.taskNumber && inFlight.has(p.taskNumber)).reverse()) {
        try {
          count((await handlePullRequest(deps, pr, { source: "reconcile" })).result);
        } catch (err) {
          errors.push(`${pr.repo}#${pr.number}: ${message(err)}`);
        }
      }
    } catch (err) {
      errors.push(`recent pull requests: ${message(err)}`);
    }
    for (const task of await tasksInReview(deps.db)) {
      const ref = task.prUrl ? parsePullRequestUrl(task.prUrl) : null;
      try {
        const pr = ref ? await api.getPullRequest(ref.repo, ref.number) : null;
        const outcome = await reconcileLinkedPullRequest(deps.db, task.id, pr, { webUrl: deps.env.publicUrls.webUrl, now });
        count(outcome.result);
        if (outcome.result === "merged") await revalidateWeb(deps.env.webRevalidate, deps.logger, BOARD_CACHE_TAGS);
      } catch (err) {
        errors.push(`NW-${task.id}: ${message(err)}`);
      }
    }
    pullRequests = { checked, changed };
  }
  for (const e of errors) deps.logger.error("[github] sync:", e);
  const { reminded, released } = await checkInactivity(deps.db, now);
  return { pullRequests, reminded, released, deliveriesDeleted: await deleteOldDeliveries(deps.db, now), errors };
}
