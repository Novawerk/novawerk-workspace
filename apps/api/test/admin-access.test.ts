// One account and one session for everyone (NB-ADR-0014) take away the second cookie that kept
// the admin panel apart. These tests walk every /admin route the app has (read from the router,
// so a new route is covered the day it is added) and check that only the role and the project
// team let anyone in, and that a personal access token never does.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, projectMembers, type Database } from "@nw/db";
import { createToken } from "@nw/tasks";

import { TEST_MEMBERS, createTestDb, joinATeam, makeApp, resetDb, sessionCookie } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    ...TEST_MEMBERS,
    // Signed up on the website: a member on no project's team, with GitHub linked.
    { id: "lena", handle: "lena", displayName: "Lena", email: "lena@example.org", githubId: 7 },
  ]);
  await joinATeam(db, "grace");
});

const ID = "00000000-0000-4000-8000-000000000000";

/** Every concrete /admin route, once, with its parameters filled in. */
function adminRoutes(app: ReturnType<typeof makeApp>["app"]): [string, string][] {
  const seen = new Set<string>();
  for (const r of app.routes) {
    if (r.method === "ALL" || !r.path.startsWith("/admin/")) continue;
    seen.add(`${r.method} ${r.path.replace(/:[A-Za-z]+/g, ID)}`);
  }
  return [...seen].map((key) => key.split(" ") as [string, string]);
}

/** What a member on a project's team may reach without the maintainer role (NB-ADR-0008; src/routes/admin.ts). */
const forTeams = (method: string, path: string) =>
  !(method === "POST" && path === "/admin/projects") &&
  (/^\/admin\/(me|projects|posts|cards|uploads)(\/|$)/.test(path) || (method === "GET" && path === "/admin/members"));

async function call(app: ReturnType<typeof makeApp>["app"], method: string, path: string, headers: Record<string, string>) {
  const body = ["POST", "PATCH", "PUT"].includes(method) ? JSON.stringify({}) : undefined;
  return app.request(path, {
    method,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body } : {}),
  });
}

describe("every /admin route (NB-ADR-0014)", () => {
  it("finds the routes it checks", () => {
    const routes = adminRoutes(makeApp(db).app);
    expect(routes.length).toBeGreaterThan(90);
    expect(routes).toContainEqual(["POST", `/admin/outbox/${ID}/approve`]);
  });

  it("answers 401 without a session", async () => {
    const { app } = makeApp(db);
    for (const [method, path] of adminRoutes(app)) {
      expect((await call(app, method, path, {})).status, `${method} ${path}`).toBe(401);
    }
  });

  it("answers 403 to a member on no project's team, everywhere", async () => {
    const { app } = makeApp(db);
    const cookie = await sessionCookie("lena");
    for (const [method, path] of adminRoutes(app)) {
      expect((await call(app, method, path, { Cookie: cookie })).status, `${method} ${path}`).toBe(403);
    }
  });

  it("answers 403 to a member on a team everywhere but their projects, posts and profile", async () => {
    const { app } = makeApp(db);
    const cookie = await sessionCookie("grace");
    const closed = adminRoutes(app).filter(([method, path]) => !forTeams(method, path));
    expect(closed.length).toBeGreaterThan(60);
    for (const [method, path] of closed) {
      expect((await call(app, method, path, { Cookie: cookie })).status, `${method} ${path}`).toBe(403);
    }
    // On their own project too: the stage, deleting it and the like stay with maintainers.
    const [project] = await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.memberId, "grace"));
    expect((await call(app, "DELETE", `/admin/projects/${project!.id}`, { Cookie: cookie })).status).toBe(403);
  });

  it("never lets a personal access token in, not even a maintainer's", async () => {
    const { app } = makeApp(db);
    await db.update(members).set({ githubId: 1 }).where(eq(members.id, "ada"));
    const { secret } = await createToken(db, "ada", {
      name: "Script",
      scopes: ["tasks:read", "proposals:write", "discussion:write", "tasks:work", "suggestions:write", "profile:write"],
      expiresInDays: 30,
    });
    for (const [method, path] of adminRoutes(app)) {
      const res = await call(app, method, path, { Authorization: `Bearer ${secret}` });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});
