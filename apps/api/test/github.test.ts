// GitHub and the task board over HTTP: the signed webhook, delivery de-dup, the replies on the
// PR, the website refresh after a merge, the nightly sync; and the assignee routes, reports and
// blocks the website uses. The rules themselves are tested in packages/tasks.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { contributors, members, taskPosts, tasks, werkLedger, type Database } from "@nw/db";
import type { GitHubApi, PullRequestFacts } from "@nw/github";

import { readEnv } from "../src/deps.js";
import { contributorCookie, createTestDb, makeApp, resetDb, TEST_MEMBERS, type TestApp } from "./helpers.js";

const SECRET = "webhook-secret-0123456789";
const CRON = "cron-secret-0123456789";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});

let lenaId: string;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  const [lena] = await db
    .insert(contributors)
    .values({ handle: "lena-k", displayName: "Lena", githubId: 90000001, githubLogin: "lena-k" })
    .returning();
  lenaId = lena!.id;
});
afterEach(() => vi.unstubAllGlobals());

/** A fake GitHub App: records what the API asked, serves `recent` to the reconcile. */
function fakeGitHub(recent: PullRequestFacts[] = []) {
  const calls: { kind: string; repo: string; number: number; value: unknown }[] = [];
  const api: GitHubApi = {
    comment: async (repo, number, body) => void calls.push({ kind: "comment", repo, number, value: body }),
    addLabels: async (repo, number, labels) => void calls.push({ kind: "labels", repo, number, value: labels }),
    recentPullRequests: async () => recent,
  };
  return { api, calls };
}

const fixture = JSON.parse(readFileSync(new URL("../../../packages/github/src/fixtures/pull_request.opened.json", import.meta.url), "utf8"));

/** The fixture PR pointed at task `n`, as `action`. */
function payload(n: number, action = "opened", pr: Record<string, unknown> = {}) {
  return {
    ...fixture,
    action,
    pull_request: { ...fixture.pull_request, body: `Task: NW-${n}`, ...pr },
  };
}

function deliver(app: TestApp, body: unknown, opts: { event?: string; id?: string; secret?: string } = {}) {
  const raw = JSON.stringify(body);
  return app.request("/webhooks/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": opts.event ?? "pull_request",
      "X-GitHub-Delivery": opts.id ?? crypto.randomUUID(),
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", opts.secret ?? SECRET).update(raw).digest("hex")}`,
    },
    body: raw,
  });
}

async function assignedTask(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db
    .insert(tasks)
    .values({ title: "Dark mode toggle", area: "web", size: "L", status: "assigned", assigneeId: lenaId, assignedAt: new Date(), ...fields })
    .returning();
  return row!;
}

describe("POST /webhooks/github", () => {
  it("is a 404 without a secret, and a 401 with a wrong signature", async () => {
    const t = await assignedTask();
    expect((await deliver(makeApp(db).app, payload(t.id))).status).toBe(404);
    const { app } = makeApp(db, { env: { githubWebhookSecret: SECRET } });
    expect((await deliver(app, payload(t.id), { secret: "not-the-secret" })).status).toBe(401);
    expect((await db.select().from(tasks))[0]?.status).toBe("assigned");
  });

  it("links the PR, comments and labels it, and does nothing twice for a redelivery", async () => {
    const t = await assignedTask();
    const { api, calls } = fakeGitHub();
    const { app } = makeApp(db, { env: { githubWebhookSecret: SECRET }, githubApi: api });
    const id = crypto.randomUUID();
    const res = await deliver(app, payload(t.id), { id });
    expect(await res.json()).toEqual({ result: "linked", task: t.id });
    expect(calls.map((c) => [c.kind, c.repo, c.number])).toEqual([
      ["comment", "Novawerk/novawerk-workspace", 212],
      ["labels", "Novawerk/novawerk-workspace", 212],
    ]);
    expect(calls[1]?.value).toEqual(["size:L"]);
    expect(await (await deliver(app, payload(t.id), { id })).json()).toEqual({ duplicate: true });
    expect(calls).toHaveLength(2);
  });

  it("merges: done, Werk once, a thank-you, and the website's task pages refresh", async () => {
    const t = await assignedTask({ status: "in_review", prUrl: fixture.pull_request.html_url });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { api, calls } = fakeGitHub();
    const { app } = makeApp(db, {
      env: { githubWebhookSecret: SECRET, webRevalidate: { url: "https://novawerk.io/api/revalidate", secret: "r" } },
      githubApi: api,
    });
    const merged = payload(t.id, "closed", { state: "closed", merged: true, merged_at: "2026-10-16T09:00:00Z" });
    expect(await (await deliver(app, merged)).json()).toEqual({ result: "merged", task: t.id });
    expect(await (await deliver(app, merged)).json()).toEqual({ result: "unchanged", task: t.id }); // a new delivery id, same PR
    expect(await db.select().from(werkLedger)).toMatchObject([{ contributorId: lenaId, delta: 8 }]);
    expect(String(calls[0]?.value)).toContain("+8 Werk to @lena-k");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toMatchObject(["https://novawerk.io/api/revalidate", { body: JSON.stringify({ tags: ["tasks", "contributors"] }) }]);
  });

  it("answers ping and other events without touching anything; a bad payload is a 400", async () => {
    const { app } = makeApp(db, { env: { githubWebhookSecret: SECRET } });
    expect(await (await deliver(app, { zen: "Keep it simple" }, { event: "ping" })).json()).toEqual({ ignored: "ping" });
    expect((await deliver(app, {}, { event: "issues" })).status).toBe(200);
    expect((await deliver(app, { action: "opened" })).status).toBe(400);
    expect((await deliver(app, payload(1), { id: "../etc" })).status).toBe(400);
  });

  it("still moves the task without App credentials, and says so in the log", async () => {
    const t = await assignedTask();
    const { app, logger } = makeApp(db, { env: { githubWebhookSecret: SECRET } });
    expect(await (await deliver(app, payload(t.id))).json()).toEqual({ result: "linked", task: t.id });
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("GET /cron/github-sync", () => {
  it("catches up on a missed merge and releases an idle task, idempotently", async () => {
    const missed = await assignedTask({ status: "in_review", prUrl: fixture.pull_request.html_url });
    const idle = await assignedTask({ title: "Idle", lastActivityAt: new Date(Date.now() - 15 * 24 * 3_600_000) });
    const mergedPr: PullRequestFacts = {
      repo: "Novawerk/novawerk-workspace",
      number: 212,
      url: fixture.pull_request.html_url,
      title: "Dark mode",
      authorId: 90000001,
      authorLogin: "lena-k",
      state: "closed",
      merged: true,
      taskNumber: missed.id,
    };
    const { api, calls } = fakeGitHub([mergedPr]);
    const { app } = makeApp(db, { env: { cronSecret: CRON }, githubApi: api });
    const run = () => app.request("/cron/github-sync", { headers: { Authorization: `Bearer ${CRON}` } });

    expect((await app.request("/cron/github-sync")).status).toBe(401);
    expect(await (await run()).json()).toEqual({
      pullRequests: { checked: 1, changed: { merged: 1 } },
      reminded: [],
      released: [idle.id],
      deliveriesDeleted: 0,
    });
    expect(calls.filter((c) => c.kind === "comment")).toHaveLength(1);
    expect(await (await run()).json()).toMatchObject({ pullRequests: { checked: 1, changed: {} }, released: [] });
    expect(calls.filter((c) => c.kind === "comment")).toHaveLength(1);
  });
});

describe("the assignee's routes, reports and blocks", () => {
  it("guide, my tasks, link a PR, a week more, release", async () => {
    const t = await assignedTask({ criteria: ["Works"] });
    const { app } = makeApp(db);
    const cookie = await contributorCookie(lenaId);
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, {
        method,
        headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, body: (await res.json()) as any };
    };

    expect((await call("GET", `/contrib/tasks/NW-${t.id}/guide`)).body.markdown).toContain(`Task: NW-${t.id}`);
    expect((await call("GET", "/contrib/me/tasks")).body).toMatchObject({ held: [{ id: `NW-${t.id}` }], proposals: [] });
    expect((await call("POST", `/contrib/tasks/${t.id}/extend`)).body).toMatchObject({ ok: true, extendedAt: expect.any(String) });
    expect((await call("POST", `/contrib/tasks/${t.id}/extend`)).status).toBe(409);
    expect((await call("POST", `/contrib/tasks/${t.id}/pr`, { url: "https://gitlab.com/x/y/pull/1" })).status).toBe(400);
    expect((await call("POST", `/contrib/tasks/${t.id}/pr`, { url: "https://github.com/Novawerk/novawerk-workspace/pull/7" })).body).toEqual({
      ok: true,
      status: "in_review",
      prUrl: "https://github.com/Novawerk/novawerk-workspace/pull/7",
    });
    expect((await call("POST", `/contrib/tasks/${t.id}/release`, { reason: "Busy" })).status).toBe(409); // in review now
    const other = await assignedTask({ title: "Other", status: "assigned" });
    expect((await call("POST", `/contrib/tasks/${other.id}/release`, {})).body).toEqual({ ok: true });
  });

  it("reports a post, and lists blocks without private handles", async () => {
    const [jonas] = await db.insert(contributors).values({ handle: "jonas", displayName: "Jonas" }).returning();
    const t = await assignedTask({ status: "done", doneAt: new Date() });
    const [post] = await db.insert(taskPosts).values({ taskId: t.id, authorContributorId: lenaId, body: "Hi" }).returning();
    const { app } = makeApp(db);
    const report = await app.request(`/contrib/posts/${post!.id}/report`, {
      method: "POST",
      headers: { Cookie: await contributorCookie(jonas!.id), "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Spam" }),
    });
    expect(report.status).toBe(200);

    const blocks = (await (await app.request("/public/blocks")).json()) as { handle: string; id: string }[];
    expect(blocks).toEqual([{ id: `NW-${t.id}`, title: "Dark mode toggle", area: "web", size: "L", handle: expect.stringMatching(/^anon-[0-9a-f]{8}$/), mergedAt: expect.any(String) }]);
  });
});

describe("GitHub App env in readEnv", () => {
  const required = { DATABASE_URL: "postgres://localhost/test", GOOGLE_CLIENT_ID: "client", SESSION_SECRET: "x".repeat(40) };

  it("takes all three App variables or none, and a long enough webhook secret", () => {
    expect(readEnv(required).githubAppAuth).toBeUndefined();
    const all = { GITHUB_APP_ID: "5317582", GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nx", GITHUB_APP_INSTALLATION_ID: "171409213" };
    expect(readEnv({ ...required, ...all }).githubAppAuth).toMatchObject({ appId: "5317582", installationId: "171409213" });
    expect(() => readEnv({ ...required, GITHUB_APP_ID: "5317582" })).toThrow(/GITHUB_APP_PRIVATE_KEY/);
    expect(() => readEnv({ ...required, ...all, GITHUB_APP_INSTALLATION_ID: "abc" })).toThrow(/INSTALLATION_ID/);
    expect(() => readEnv({ ...required, GITHUB_WEBHOOK_SECRET: "short" })).toThrow(/GITHUB_WEBHOOK_SECRET/);
    expect(readEnv({ ...required, GITHUB_WEBHOOK_SECRET: SECRET }).config.githubWebhookSecret).toBe(SECRET);
  });
});
