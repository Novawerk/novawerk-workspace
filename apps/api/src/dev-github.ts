// Local development only (DEV_LOGIN=true and no GitHub App): a GitHub that lives in this process,
// so a contributor can run every board flow without our App's keys.
//
//   Sign in / link GitHub  the OAuth flow as in production, but "authorize" is a page here
//                          (/dev/github/authorize) that asks which GitHub login you are
//   Link a PR by hand      answered from the pull requests opened on /dev/github
//   Open, merge, close     /dev/github: each one goes through the same parser and handler as
//                          GitHub's webhook (src/github.ts)
//
// Pull requests live in memory and are gone when the API restarts; what they did to tasks stays.

import { createHash } from "node:crypto";

import { Hono } from "hono";
import { html } from "hono/html";

import { parseWebhook, type GitHubApi, type PullRequestFacts } from "@nw/github";
import type { GitHubUser } from "@nw/tasks";

import type { GitHubOAuth } from "./github-auth.js";
import { BOARD_REPO, handlePullRequest } from "./github.js";
import type { ApiEnv, AppDeps, Logger } from "./types.js";

/** A stable GitHub id for a login, well away from small real ids. */
export function devGitHubId(login: string): number {
  return 1_000_000_000 + (createHash("sha256").update(login.toLowerCase()).digest().readUInt32BE(0) % 1_000_000_000);
}

const LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

interface DevPullRequest {
  number: number;
  title: string;
  body: string;
  branch: string;
  login: string;
  state: "open" | "closed";
  merged: boolean;
  updatedAt: Date;
}

export class DevGitHub implements GitHubOAuth, GitHubApi {
  private readonly pulls = new Map<number, DevPullRequest>();
  private next = 1;
  /** Replies the board asked for (comments, labels), newest last. Shown on /dev/github. */
  readonly replies: { number: number; text: string }[] = [];

  constructor(private readonly apiUrl: string) {}

  // ─── OAuth ────────────────────────────────────────────────────────────────

  authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(`${this.apiUrl}/dev/github/authorize`);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  }

  /** The "code" is the login typed on the authorize page. */
  async exchange(code: string): Promise<GitHubUser> {
    if (!LOGIN.test(code)) throw new Error("Not a GitHub login");
    return { id: devGitHubId(code), login: code, name: null, avatarUrl: null, email: null };
  }

  // ─── The App's API ────────────────────────────────────────────────────────

  async comment(_repo: string, number: number, body: string): Promise<void> {
    this.replies.push({ number, text: body });
  }

  async addLabels(_repo: string, number: number, labels: string[]): Promise<void> {
    this.replies.push({ number, text: `Labels: ${labels.join(", ")}` });
  }

  async recentPullRequests(repo: string, since: Date, limit = 100): Promise<PullRequestFacts[]> {
    if (repo !== BOARD_REPO) return [];
    return [...this.pulls.values()]
      .filter((pr) => pr.updatedAt >= since)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((pr) => this.facts(pr));
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestFacts | null> {
    const pr = repo === BOARD_REPO ? this.pulls.get(number) : undefined;
    return pr ? this.facts(pr) : null;
  }

  // ─── Pull requests ────────────────────────────────────────────────────────

  /** The webhook payload GitHub would send, so the real parser reads it. */
  payload(pr: DevPullRequest, action: string) {
    return {
      action,
      repository: { full_name: BOARD_REPO },
      pull_request: {
        number: pr.number,
        html_url: `https://github.com/${BOARD_REPO}/pull/${pr.number}`,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        merged: pr.merged,
        merged_at: pr.merged ? pr.updatedAt.toISOString() : null,
        updated_at: pr.updatedAt.toISOString(),
        author_association: "CONTRIBUTOR",
        user: { id: devGitHubId(pr.login), login: pr.login },
        head: { ref: pr.branch },
        base: { repo: { full_name: BOARD_REPO } },
      },
    };
  }

  private facts(pr: DevPullRequest): PullRequestFacts {
    const parsed = parseWebhook("pull_request", this.payload(pr, "edited"));
    if (parsed.kind !== "pull_request") throw new Error("unreachable");
    return parsed.pr;
  }

  open(input: { login: string; title: string; body: string; branch: string }): DevPullRequest {
    const pr: DevPullRequest = { ...input, number: this.next++, state: "open", merged: false, updatedAt: new Date() };
    this.pulls.set(pr.number, pr);
    return pr;
  }

  update(number: number, change: "merge" | "close" | "reopen"): DevPullRequest | null {
    const pr = this.pulls.get(number);
    if (!pr) return null;
    if (change === "reopen") Object.assign(pr, { state: "open", merged: false });
    else Object.assign(pr, { state: "closed", merged: change === "merge" });
    pr.updatedAt = new Date();
    return pr;
  }

  list(): DevPullRequest[] {
    return [...this.pulls.values()].sort((a, b) => b.number - a.number);
  }
}

const page = (title: string, body: ReturnType<typeof html>) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} · local GitHub</title>
      <style>
        body { font: 15px/1.5 system-ui, sans-serif; max-width: 760px; margin: 32px auto; padding: 0 16px; color: #18181b; background: #fafafa; }
        h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 32px; }
        input, textarea { font: inherit; width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d4d4d8; border-radius: 6px; }
        label { display: block; margin: 12px 0 4px; font-weight: 600; }
        button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #18181b; background: #18181b; color: #fff; cursor: pointer; margin-top: 12px; }
        button.quiet { background: #fff; color: #18181b; }
        table { width: 100%; border-collapse: collapse; } td, th { text-align: left; padding: 6px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
        .note { color: #52525b; font-size: 13px; } form.inline { display: inline; }
      </style>
    </head>
    <body>
      ${body}
    </body>
  </html>`;

/** /dev/github: 404 unless the API runs with DevGitHub (see deps.ts). */
export function devGitHubRoutes(deps: AppDeps & { logger: Logger }) {
  const gh = deps.devGitHub;
  const apiUrl = deps.env.publicUrls.apiUrl;

  const deliver = async (pr: DevPullRequest, action: string) => {
    const parsed = parseWebhook("pull_request", gh!.payload(pr, action));
    if (parsed.kind !== "pull_request") return;
    const outcome = await handlePullRequest(deps, parsed.pr, { source: "webhook", action: parsed.action });
    deps.logger.warn(`[dev-github] #${pr.number} ${action}: ${outcome.result}${outcome.taskNumber ? ` (NW-${outcome.taskNumber})` : ""}`);
  };

  return new Hono<ApiEnv>()
    .use("*", async (c, next) => (gh ? next() : c.json({ error: "Not found" }, 404)))

    .get("/authorize", (c) => {
      const { state = "", redirect_uri: redirectUri = "" } = c.req.query();
      // Only our own callback: this page never sends anyone elsewhere.
      if (!redirectUri.startsWith(`${apiUrl}/auth/`)) return c.json({ error: "Bad redirect_uri" }, 400);
      return c.html(
        page(
          "Sign in with GitHub",
          html`<h1>Sign in with GitHub (local)</h1>
            <p class="note">
              This API runs without our GitHub App, so GitHub is simulated. Type the GitHub login to sign in or link as.
              Use your real one if you like: the same login always gets the same id here.
            </p>
            <form method="get" action="${redirectUri}">
              <input type="hidden" name="state" value="${state}" />
              <label for="code">GitHub login</label>
              <input id="code" name="code" required pattern="[A-Za-z0-9][A-Za-z0-9-]{0,38}" placeholder="octocat" autofocus />
              <button type="submit">Authorize</button>
            </form>`,
        ),
      );
    })

    .get("/", (c) => {
      const pulls = gh!.list();
      return c.html(
        page(
          "Pull requests",
          html`<h1>Local GitHub: ${BOARD_REPO}</h1>
            <p class="note">
              Pull requests here go to the task board like GitHub's webhook would. Open one as the GitHub login you linked,
              with <code>Task: NW-&lt;n&gt;</code> in the body, then merge it. The API log says what each one did.
            </p>
            <h2>Open a pull request</h2>
            <form method="post" action="${apiUrl}/dev/github/pulls">
              <label for="login">Author (GitHub login)</label><input id="login" name="login" required />
              <label for="title">Title</label><input id="title" name="title" required placeholder="Web: …" />
              <label for="body">Body</label><textarea id="body" name="body" rows="3">Task: NW-</textarea>
              <label for="branch">Branch</label><input id="branch" name="branch" value="my-change" />
              <button type="submit">Open pull request</button>
            </form>
            <h2>Pull requests</h2>
            ${pulls.length
              ? html`<table>
                  <tr><th>#</th><th>Title</th><th>Author</th><th>State</th><th></th></tr>
                  ${pulls.map(
                    (pr) => html`<tr>
                      <td>${pr.number}</td>
                      <td>${pr.title}<br /><span class="note">https://github.com/${BOARD_REPO}/pull/${pr.number}</span></td>
                      <td>${pr.login}</td>
                      <td>${pr.merged ? "merged" : pr.state}</td>
                      <td>
                        ${pr.state === "open"
                          ? html`<form class="inline" method="post" action="${apiUrl}/dev/github/pulls/${pr.number}/merge"><button>Merge</button></form>
                              <form class="inline" method="post" action="${apiUrl}/dev/github/pulls/${pr.number}/close"><button class="quiet">Close</button></form>`
                          : pr.merged
                            ? ""
                            : html`<form class="inline" method="post" action="${apiUrl}/dev/github/pulls/${pr.number}/reopen"><button class="quiet">Reopen</button></form>`}
                      </td>
                    </tr>`,
                  )}
                </table>`
              : html`<p class="note">None yet.</p>`}
            ${gh!.replies.length
              ? html`<h2>What the board said on GitHub</h2>
                  <ul>
                    ${gh!.replies.map((r) => html`<li>#${r.number}: ${r.text}</li>`)}
                  </ul>`
              : ""}`,
        ),
      );
    })

    .post("/pulls", async (c) => {
      const form = await c.req.parseBody();
      const field = (key: string) => (typeof form[key] === "string" ? (form[key] as string).trim() : "");
      const login = field("login");
      if (!LOGIN.test(login) || !field("title")) return c.json({ error: "A GitHub login and a title" }, 400);
      const pr = gh!.open({ login, title: field("title"), body: field("body"), branch: field("branch") || "my-change" });
      await deliver(pr, "opened");
      return c.redirect(`${apiUrl}/dev/github`, 303);
    })

    .post("/pulls/:number/:change{merge|close|reopen}", async (c) => {
      const change = c.req.param("change") as "merge" | "close" | "reopen";
      const pr = gh!.update(Number(c.req.param("number")), change);
      if (!pr) return c.json({ error: "No such pull request" }, 404);
      await deliver(pr, change === "reopen" ? "reopened" : "closed");
      return c.redirect(`${apiUrl}/dev/github`, 303);
    });
}
