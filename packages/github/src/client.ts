// The GitHub App `novawerk-task-board` acting on our repository: an App JWT (RS256, from the
// private key) buys a short-lived installation token, which @octokit/auth-app caches and renews.
// The board needs three things: comment on a PR, label it, and list recent PRs for the nightly
// reconcile. The interface is what the API and tests use; tests pass a fake.

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/core";

import { pullRequestFacts, pullRequestSchema, type PullRequestFacts } from "./webhook.js";

export interface GitHubApi {
  comment(repo: string, issueNumber: number, body: string): Promise<void>;
  addLabels(repo: string, issueNumber: number, labels: string[]): Promise<void>;
  /** PRs updated since `since`, newest first (at most `limit`). */
  recentPullRequests(repo: string, since: Date, limit?: number): Promise<PullRequestFacts[]>;
  /** One PR, or null only when GitHub says 404. Anything else (a 5xx, a payload we can't read) throws. */
  getPullRequest(repo: string, number: number): Promise<PullRequestFacts | null>;
}

/** Every call to GitHub gives up after this long, so a slow GitHub can't hold a request or the cron. */
export const GITHUB_TIMEOUT_MS = 10_000;

export interface GitHubAppCredentials {
  appId: string;
  /** PEM. Newlines may arrive as literal `\n` from an env var. */
  privateKey: string;
  installationId: string;
}

/** Literal `\n` in a one-line env value back to real newlines. */
export const normalisePrivateKey = (key: string) => (key.includes("\\n") ? key.replace(/\\n/g, "\n") : key).trim();

function split(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Not a repository: ${repo}`);
  return { owner, repo: name };
}

export function createGitHubApi(credentials: GitHubAppCredentials, opts: { fetch?: typeof fetch } = {}): GitHubApi {
  const base = opts.fetch ?? fetch;
  const timed: typeof fetch = (input, init) =>
    base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(GITHUB_TIMEOUT_MS) });
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: credentials.appId,
      privateKey: normalisePrivateKey(credentials.privateKey),
      installationId: Number(credentials.installationId),
    },
    userAgent: "novawerk-task-board",
    request: { fetch: timed },
  });

  return {
    async comment(repo, issueNumber, body) {
      await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        ...split(repo),
        issue_number: issueNumber,
        body,
      });
    },
    async addLabels(repo, issueNumber, labels) {
      await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", {
        ...split(repo),
        issue_number: issueNumber,
        labels,
      });
    },
    async getPullRequest(repo, number) {
      let data: unknown;
      try {
        data = (await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", { ...split(repo), pull_number: number })).data;
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
      // A format we can't read is an error, never "gone": the nightly sync would otherwise send
      // every task in review back to assigned.
      return pullRequestFacts(pullRequestSchema.parse(data));
    },
    async recentPullRequests(repo, since, limit = 300) {
      const out: PullRequestFacts[] = [];
      for (let page = 1; out.length < limit && page <= 10; page++) {
        const res = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
          ...split(repo),
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 100,
          page,
        });
        const items = res.data as unknown[];
        for (const item of items) {
          const pr = pullRequestSchema.safeParse(item);
          if (!pr.success) continue;
          if (pr.data.updated_at && Date.parse(pr.data.updated_at) < since.getTime()) return out;
          out.push(pullRequestFacts(pr.data));
        }
        if (items.length < 100) break;
      }
      return out;
    },
  };
}
