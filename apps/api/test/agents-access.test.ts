// Agent access over HTTP: tokens are made and revoked only in the browser, a token acts within
// its scopes, its proposals are drafts until confirmed, and the MCP server at /mcp exposes the
// same functions. The rules themselves are tested in packages/tasks (tokens.test.ts).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TOKEN_LIMITS } from "@nw/contracts";
import { contributors, members, taskProposals, tasks, type Database } from "@nw/db";

import { contributorCookie, createTestDb, makeApp, resetDb, sessionCookie, TEST_MEMBERS, type TestApp } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});

let lenaId: string;
let cookie: string;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  const [lena] = await db
    .insert(contributors)
    .values({ handle: "lena-k", displayName: "Lena", githubId: 90000001, githubLogin: "lena-k", email: "lena@example.com" })
    .returning();
  lenaId = lena!.id;
  cookie = await contributorCookie(lenaId);
});

type Auth = { cookie?: string; bearer?: string };

async function call(app: TestApp, method: string, path: string, auth: Auth, body?: unknown) {
  const headers: Record<string, string> = {};
  if (auth.cookie) Object.assign(headers, { Cookie: auth.cookie, Origin: "https://novawerk.io" });
  if (auth.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as any };
}

async function makeToken(app: TestApp, scopes: string[], name = "Claude Code") {
  const res = await call(app, "POST", "/contrib/tokens", { cookie }, { name, scopes, expiresInDays: 30 });
  expect(res.status).toBe(201);
  return res.body as { id: string; secret: string; scopes: string[] };
}

async function openTask(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db.insert(tasks).values({ title: "Dark mode", area: "web", size: "M", status: "open", criteria: ["Works"], ...fields }).returning();
  return row!;
}

const plan = { approach: "A toggle in the header", eta: "week", readCriteria: true };

describe("tokens", () => {
  it("are made, listed and revoked in the browser only", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, ["proposals:write"]);
    expect(token.scopes).toEqual(["tasks:read", "proposals:write"]);
    const list = await call(app, "GET", "/contrib/tokens", { cookie });
    expect(list.body).toMatchObject([{ id: token.id, name: "Claude Code", prefix: token.secret.slice(0, 12) }]);
    expect(JSON.stringify(list.body)).not.toContain(token.secret);

    // A token can't manage tokens, confirm drafts or delete the account.
    expect((await call(app, "GET", "/contrib/tokens", { bearer: token.secret })).status).toBe(403);
    expect((await call(app, "POST", "/contrib/tokens", { bearer: token.secret }, { name: "x", expiresInDays: 90 })).status).toBe(403);
    expect((await call(app, "DELETE", "/contrib/me", { bearer: token.secret }, { confirmHandle: "lena-k" })).status).toBe(403);
    expect((await call(app, "GET", "/auth/contributor/me", { bearer: token.secret })).status).toBe(401);

    expect((await call(app, "DELETE", `/contrib/tokens/${token.id}`, { cookie })).body).toEqual({ ok: true });
    expect((await call(app, "GET", "/contrib/me", { bearer: token.secret })).status).toBe(401);
  });

  it("act within their scopes, never as a member", async () => {
    const { app } = makeApp(db);
    const readOnly = await makeToken(app, []);
    const task = await openTask();
    const me = await call(app, "GET", "/contrib/me", { bearer: readOnly.secret });
    expect(me.body).toMatchObject({ handle: "lena-k", email: null });
    const denied = await call(app, "POST", `/contrib/tasks/${task.id}/proposals`, { bearer: readOnly.secret }, plan);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/proposals:write/);
    expect((await call(app, "POST", `/contrib/tasks/${task.id}/posts`, { bearer: readOnly.secret }, { body: "Hi" })).status).toBe(403);
    expect((await call(app, "GET", "/admin/me", { bearer: readOnly.secret })).status).toBe(401);
    expect((await call(app, "GET", "/contrib/me", { bearer: "nwt_made-up" })).status).toBe(401);
    // A member's session is still not a contributor.
    expect((await call(app, "GET", "/contrib/me", { cookie: await sessionCookie("ada") })).status).toBe(401);
  });

  it("can't change the handle or who sees the profile", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, ["profile:write"]);
    expect((await call(app, "PATCH", "/contrib/me/profile", { bearer: token.secret }, { public: true })).status).toBe(403);
    expect((await call(app, "PATCH", "/contrib/me/profile", { bearer: token.secret }, { handle: "lena" })).status).toBe(403);
    const ok = await call(app, "PATCH", "/contrib/me/profile", { bearer: token.secret }, { bio: "Builds things" });
    expect(ok.body).toMatchObject({ bio: "Builds things", email: null });
  });

  it("propose drafts the person confirms in the browser; everything shows via agent", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, ["proposals:write", "discussion:write"]);
    const task = await openTask();
    const drafted = await call(app, "POST", `/contrib/tasks/NW-${task.id}/proposals`, { bearer: token.secret }, plan);
    expect(drafted.status).toBe(201);
    expect(drafted.body).toMatchObject({ draft: true, viaAgent: "Claude Code" });
    expect((await call(app, "GET", `/public/tasks/NW-${task.id}`, {})).body.proposals).toEqual([]);

    expect((await call(app, "POST", `/contrib/proposals/${drafted.body.id}/confirm`, { bearer: token.secret })).status).toBe(403);
    const confirmed = await call(app, "POST", `/contrib/proposals/${drafted.body.id}/confirm`, { cookie });
    expect(confirmed.body).toMatchObject({ status: "pending" });
    await call(app, "POST", `/contrib/tasks/${task.id}/posts`, { bearer: token.secret }, { body: "On it" });
    const detail = (await call(app, "GET", `/public/tasks/NW-${task.id}`, {})).body;
    expect(detail.proposals).toMatchObject([{ status: "pending", viaAgent: "Claude Code" }]);
    expect(detail.posts).toMatchObject([{ body: "On it", viaAgent: "Claude Code" }]);
  });

  it("have their own write budget", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, ["suggestions:write"]);
    const s = await openTask({ status: "suggested", kind: "bug" });
    let status = 200;
    for (let i = 0; i <= TOKEN_LIMITS.writesPerHour && status !== 429; i++) {
      status = (await call(app, "PUT", `/contrib/tasks/${s.id}/vote`, { bearer: token.secret })).status;
    }
    expect(status).toBe(429);
    // The browser session isn't affected; the token's +1 is hers.
    expect((await call(app, "GET", "/contrib/me/votes", { cookie })).body).toEqual({ taskIds: [`NW-${s.id}`] });
  });

  it("are optional on public reads, and a bad one is a 401 there too", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, []);
    expect((await call(app, "GET", "/public/tasks", {})).status).toBe(200);
    expect((await call(app, "GET", "/public/tasks", { bearer: token.secret })).status).toBe(200);
    expect((await call(app, "GET", "/public/tasks", { bearer: "nwt_nope" })).status).toBe(401);
  });
});

describe("GET /contrib/me/votes", () => {
  it("lists the suggestions I +1'd", async () => {
    const { app } = makeApp(db);
    const s = await openTask({ status: "suggested", kind: "bug" });
    await call(app, "PUT", `/contrib/tasks/${s.id}/vote`, { cookie });
    expect((await call(app, "GET", "/contrib/me/votes", { cookie })).body).toEqual({ taskIds: [`NW-${s.id}`] });
  });
});

describe("/mcp", () => {
  async function rpc(app: TestApp, method: string, params: unknown, bearer?: string) {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  const tool = async (app: TestApp, name: string, args: unknown, bearer?: string) => {
    const { body } = await rpc(app, "tools/call", { name, arguments: args }, bearer);
    const text = body.result.content[0].text as string;
    return { isError: Boolean(body.result.isError), text, json: body.result.isError ? null : JSON.parse(text) };
  };

  it("initializes and lists its tools", async () => {
    const { app } = makeApp(db);
    const init = await rpc(app, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.body.result.serverInfo.name).toBe("novawerk-task-board");
    const tools = (await rpc(app, "tools/list", {})).body.result.tools.map((t: { name: string }) => t.name);
    expect(tools.sort()).toEqual(
      [
        "get_guide",
        "get_task",
        "link_pr",
        "list_contributors",
        "list_tasks",
        "my_tasks",
        "post_comment",
        "propose",
        "release_task",
        "remove_upvote",
        "suggest_task",
        "update_profile",
        "upvote_task",
        "whoami",
      ].sort(),
    );
  });

  it("reads without a token, and asks for one to act", async () => {
    const { app } = makeApp(db);
    const task = await openTask();
    const list = await tool(app, "list_tasks", { status: "open", area: ["web"] });
    expect(list.json.tasks.map((t: { id: string }) => t.id)).toEqual([`NW-${task.id}`]);
    expect((await tool(app, "get_task", { id: `NW-${task.id}` })).json.title).toBe("Dark mode");
    expect((await tool(app, "get_task", { id: "NW-999" })).isError).toBe(true);
    const denied = await tool(app, "propose", { task_id: `NW-${task.id}`, approach: "x", eta: "week" });
    expect(denied).toMatchObject({ isError: true });
    expect(denied.text).toMatch(/personal access token/);
  });

  it("drafts a proposal with a token, within its scopes", async () => {
    const { app } = makeApp(db);
    const task = await openTask();
    const readOnly = await makeToken(app, []);
    expect((await tool(app, "whoami", {}, readOnly.secret)).json).toMatchObject({ handle: "lena-k", email: null });
    expect((await tool(app, "propose", { task_id: `NW-${task.id}`, approach: "x", eta: "week" }, readOnly.secret)).text).toMatch(/proposals:write/);

    const writer = await makeToken(app, ["proposals:write"], "my agent");
    const drafted = await tool(app, "propose", { task_id: `NW-${task.id}`, approach: "Toggle in the header", eta: "week" }, writer.secret);
    expect(drafted.json).toMatchObject({ draft: true, proposal: { viaAgent: "my agent" } });
    expect(drafted.json.confirm_url).toBe(`https://novawerk.io/tasks/NW-${task.id}?confirm=${drafted.json.proposal.id}`);
    const [row] = await db.select().from(taskProposals);
    expect(row).toMatchObject({ status: "draft", viaTokenId: writer.id });
    expect((await tool(app, "my_tasks", {}, writer.secret)).json.proposals).toHaveLength(1);
  });

  it("links a PR only after reading it from GitHub, marked via agent", async () => {
    const t = await openTask({ status: "assigned", assigneeId: lenaId, assignedAt: new Date() });
    const pr = (n: number, authorId: number) => ({
      repo: "Novawerk/novawerk-workspace",
      number: n,
      url: `https://github.com/Novawerk/novawerk-workspace/pull/${n}`,
      title: "Dark mode",
      authorId,
      authorLogin: "x",
      authorAssociation: "CONTRIBUTOR",
      state: "open" as const,
      merged: false,
      taskNumber: t.id,
    });
    const githubApi = {
      comment: async () => undefined,
      addLabels: async () => undefined,
      recentPullRequests: async () => [],
      getPullRequest: async (_repo: string, n: number) => (n === 7 ? pr(7, 90000001) : n === 8 ? pr(8, 5) : null),
    };
    const { app } = makeApp(db, { githubApi });
    const token = await makeToken(app, ["tasks:work"], "my agent");
    const url = (n: number) => `https://github.com/Novawerk/novawerk-workspace/pull/${n}`;
    expect((await tool(app, "link_pr", { task_id: `NW-${t.id}`, url: url(8) }, token.secret)).text).toMatch(/linked to the person/);
    expect((await tool(app, "link_pr", { task_id: `NW-${t.id}`, url: url(9) }, token.secret)).isError).toBe(true);
    expect((await tool(app, "link_pr", { task_id: `NW-${t.id}`, url: url(7) }, token.secret)).json).toEqual({ status: "in_review", pr_url: url(7) });
    const detail = (await call(app, "GET", `/public/tasks/NW-${t.id}`, {})).body;
    expect(detail.events.at(-1)).toMatchObject({ kind: "pr_linked", viaAgent: "my agent" });
  });

  it("refuses a bad token outright", async () => {
    const { app } = makeApp(db);
    expect((await rpc(app, "tools/list", {}, "nwt_nope")).status).toBe(401);
  });
});

describe("review fixes", () => {
  it("every /contrib route has a scope or is browser-only (default deny)", async () => {
    const { contribRoutes } = await import("../src/routes/contrib.js");
    const { ACCESS_RULE, TokenGate } = await import("../src/token-gate.js");
    const routes = contribRoutes({ db, env: { sessionSecret: "x".repeat(40) } } as never, new TokenGate(db), []).routes;
    const endpoints = new Map<string, boolean>();
    for (const r of routes) {
      if (r.method === "ALL") continue;
      const key = `${r.method} ${r.path}`;
      endpoints.set(key, (endpoints.get(key) ?? false) || ACCESS_RULE in (r.handler as object));
    }
    expect(endpoints.size).toBeGreaterThan(20);
    expect([...endpoints].filter(([, ruled]) => !ruled).map(([k]) => k)).toEqual([]);
  });

  it("a token edits and discards drafts only, never a confirmed proposal", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, ["proposals:write"]);
    const task = await openTask();
    const draft = (await call(app, "POST", `/contrib/tasks/${task.id}/proposals`, { bearer: token.secret }, plan)).body;
    expect(draft).toMatchObject({ status: "draft", draft: true });
    expect((await call(app, "PATCH", `/contrib/proposals/${draft.id}`, { bearer: token.secret }, { eta: "days" })).body).toMatchObject({ eta: "days", draft: true });
    await call(app, "POST", `/contrib/proposals/${draft.id}/confirm`, { cookie });
    const rewrite = await call(app, "PATCH", `/contrib/proposals/${draft.id}`, { bearer: token.secret }, { approach: "Something else" });
    expect(rewrite.status).toBe(403);
    expect((await call(app, "DELETE", `/contrib/proposals/${draft.id}`, { bearer: token.secret })).status).toBe(403);
    expect((await call(app, "GET", `/public/tasks/NW-${task.id}`, {})).body.proposals[0].approach).toBe(plan.approach);

    // A draft discarded through the token is gone, and doesn't count.
    const other = await openTask({ title: "Other" });
    const second = (await call(app, "POST", `/contrib/tasks/${other.id}/proposals`, { bearer: token.secret }, plan)).body;
    expect((await call(app, "DELETE", `/contrib/proposals/${second.id}`, { bearer: token.secret })).body).toEqual({ ok: true });
    expect((await db.select().from(taskProposals)).map((p) => p.id)).toEqual([draft.id]);
  });

  it("stops a suspended account's tokens, and ignores Authorization headers that aren't ours", async () => {
    const { app } = makeApp(db);
    const token = await makeToken(app, []);
    expect((await call(app, "GET", "/public/tasks", { bearer: "ghp_someone_elses" })).status).toBe(200);
    await db.update(contributors).set({ suspendedAt: new Date() });
    expect((await call(app, "GET", "/contrib/me", { bearer: token.secret })).status).toBe(401);
  });

  it("refuses browser writes from other sites", async () => {
    const { app } = makeApp(db);
    const s = await openTask({ status: "suggested", kind: "bug" });
    const put = (headers: Record<string, string>) =>
      app.request(`/contrib/tasks/${s.id}/vote`, { method: "PUT", headers: { Cookie: cookie, ...headers } });
    expect((await put({ Origin: "https://evil.example" })).status).toBe(403);
    expect((await put({})).status).toBe(403);
    expect((await put({ "Content-Type": "application/json" })).status).toBe(200);
    expect((await put({ Origin: "https://novawerk.io" })).status).toBe(200);
  });

  it("asks GitHub about a PR only for the caller's own task in progress", async () => {
    let asked = 0;
    const githubApi = {
      comment: async () => undefined,
      addLabels: async () => undefined,
      recentPullRequests: async () => [],
      getPullRequest: async () => {
        asked++;
        return null;
      },
    };
    const { app } = makeApp(db, { githubApi });
    const notMine = await openTask({ status: "assigned" });
    const res = await call(app, "POST", `/contrib/tasks/${notMine.id}/pr`, { cookie }, { url: "https://github.com/Novawerk/novawerk-workspace/pull/1" });
    expect(res.status).toBe(403);
    expect(asked).toBe(0);
  });

  it("limits anonymous board reads per network", async () => {
    const { app } = makeApp(db);
    const from = { "x-forwarded-for": "198.51.100.77" };
    let status = 200;
    for (let i = 0; i <= 600 && status === 200; i++) status = (await app.request("/public/tasks?limit=1", { headers: from })).status;
    expect(status).toBe(429);
    expect((await app.request("/public/tasks?limit=1", { headers: { "x-forwarded-for": "198.51.100.78" } })).status).toBe(200);
  });

  it("exempts the website's server, which reads from shared IPs, with its key", async () => {
    const key = "web-read-key-0123456789-0123456789";
    const { app } = makeApp(db, { env: { webReadKey: key } });
    const from = { "x-forwarded-for": "198.51.100.90" };
    for (let i = 0; i < 600; i++) await app.request("/public/blocks", { headers: from });
    expect((await app.request("/public/blocks", { headers: from })).status).toBe(429);
    expect((await app.request("/public/blocks", { headers: { ...from, "x-nw-web-key": "wrong" } })).status).toBe(429);
    expect((await app.request("/public/blocks", { headers: { ...from, "x-nw-web-key": key } })).status).toBe(200);
  });
});

describe("/mcp transport rules", () => {
  const post = (app: TestApp, body: unknown, headers: Record<string, string> = {}) =>
    app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    });

  it("takes one message per request, from our origins, POST only", async () => {
    const { app } = makeApp(db);
    const one = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    expect((await post(app, [one, { ...one, id: 2 }])).status).toBe(400);
    expect((await post(app, one, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(app, one, { Origin: "https://novawerk.io" })).status).toBe(200);
    expect((await app.request("/mcp", { method: "GET" })).status).toBe(405);
    expect((await app.request("/mcp", { method: "DELETE" })).status).toBe(405);
  });
});
