// Members who aren't admins: they sign in (Google or an emailed code) and work on their own
// projects — content, deliverables, posts, files — and on nothing else.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { documents, members, posts, projectMembers, projects, signInCodes, type Database } from "@nw/db";

import { FakeFiles, TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, postJson, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([...TEST_MEMBERS, { id: "mara", displayName: "Mara", email: "mara@qq.example" }]);
});

/** `adminFetch` as someone else. */
const as = (memberId: string) => ({
  fetch: (app: Parameters<typeof adminFetch>[0], method: Parameters<typeof adminFetch>[1], path: string, body?: unknown) =>
    adminFetch(app, method, path, body, memberId),
  json: async <T = any>(app: Parameters<typeof adminFetch>[0], method: Parameters<typeof adminFetch>[1], path: string, body?: unknown) => {
    const res = await adminFetch(app, method, path, body, memberId);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  },
});

async function twoProjects() {
  const [mine, theirs] = await db
    .insert(projects)
    .values([
      { slug: "kiez", title: "Kiez Pantry", status: "building" },
      { slug: "other", title: "Other", status: "building" },
    ])
    .returning();
  await db.insert(projectMembers).values([
    { projectId: mine!.id, memberId: "mara", role: "Initiator" },
    { projectId: mine!.id, memberId: "grace", role: "Developer" },
    { projectId: theirs!.id, memberId: "ada", role: "Initiator" },
  ]);
  return { mine: mine!, theirs: theirs! };
}

describe("signing in with an emailed code", () => {
  function codeApp() {
    const sent: { to: string; code: string }[] = [];
    const { app, logger } = makeApp(db, { sendSignInCode: async (to, code) => void sent.push({ to, code }) });
    return { app, sent, logger };
  }

  it("emails a code to a member and signs them in with it, once", async () => {
    const { app, sent } = codeApp();
    expect((await app.request("/auth/email/start", postJson({ email: " Mara@QQ.example " }))).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "mara@qq.example" });
    expect(sent[0]!.code).toMatch(/^\d{6}$/);

    const ok = await app.request("/auth/email/verify", postJson({ email: "mara@qq.example", code: sent[0]!.code }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: "mara", canAdmin: false });
    expect(ok.headers.get("set-cookie")).toMatch(/^nw_session=/);

    const again = await app.request("/auth/email/verify", postJson({ email: "mara@qq.example", code: sent[0]!.code }));
    expect(again.status).toBe(400);
    // Only a hash is stored.
    const [row] = await db.select().from(signInCodes);
    expect(row!.codeHash).not.toContain(sent[0]!.code);
  });

  it("answers the same for strangers and inactive members, and sends them nothing", async () => {
    const { app, sent } = codeApp();
    for (const email of ["nobody@example.org", "linus@novawerk.io"]) {
      const res = await app.request("/auth/email/start", postJson({ email }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(sent).toEqual([]);
  });

  it("locks a code after five wrong tries, and limits how many codes an address gets", async () => {
    const { app, sent } = codeApp();
    await app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    const right = sent[0]!.code;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await app.request("/auth/email/verify", postJson({ email: "mara@qq.example", code: wrong }))).status).toBe(400);
    }
    expect((await app.request("/auth/email/verify", postJson({ email: "mara@qq.example", code: right }))).status).toBe(400);

    await app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    await app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    await app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    expect(sent).toHaveLength(3);
  });

  it("refuses an expired code", async () => {
    const { app, sent } = codeApp();
    await app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    await db.update(signInCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await app.request("/auth/email/verify", postJson({ email: "mara@qq.example", code: sent[0]!.code }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ issues: { code: ["That code is wrong or has expired"] } });
  });

  it("is off without a way to send email", async () => {
    const res = await makeApp(db).app.request("/auth/email/start", postJson({ email: "mara@qq.example" }));
    expect(res.status).toBe(503);
  });
});

describe("a member's own projects", () => {
  it("lists and opens only the projects they are on", async () => {
    const { mine, theirs } = await twoProjects();
    const { app } = makeApp(db);
    const list = await as("grace").json(app, "GET", "/admin/projects");
    expect(list.map((p: { slug: string }) => p.slug)).toEqual(["kiez"]);
    expect((await as("grace").fetch(app, "GET", `/admin/projects/${mine.id}`)).status).toBe(200);
    expect((await as("grace").fetch(app, "GET", `/admin/projects/${theirs.id}`)).status).toBe(404);
    expect((await as("grace").fetch(app, "GET", `/admin/projects/${theirs.id}/deliverables`)).status).toBe(404);

    const board = await as("grace").json(app, "GET", "/admin/projects/board");
    expect(board.pitches).toEqual([]);
    expect(board.projects.map((p: { slug: string }) => p.slug)).toEqual(["kiez"]);
    // Admins still see everything.
    expect(await adminJson(app, "GET", "/admin/projects")).toHaveLength(2);
  });

  it("edits the content but not the stage, featured, order or slug", async () => {
    const { mine } = await twoProjects();
    const { app } = makeApp(db);
    const saved = await as("grace").json(app, "PATCH", `/admin/projects/${mine.id}`, {
      tagline: "Food, not waste",
      body: "## Why",
      launchDate: "2026-12-01",
    });
    expect(saved.project).toMatchObject({ tagline: "Food, not waste", launchDate: "2026-12-01" });
    for (const patch of [{ status: "launched" }, { featured: true }, { sortOrder: 1 }, { slug: "mine" }]) {
      expect((await as("grace").fetch(app, "PATCH", `/admin/projects/${mine.id}`, patch)).status, JSON.stringify(patch)).toBe(403);
    }
    expect((await as("grace").fetch(app, "POST", "/admin/projects", { slug: "new", title: "New" })).status).toBe(403);
    expect((await as("grace").fetch(app, "DELETE", `/admin/projects/${mine.id}`)).status).toBe(403);
  });

  it("lets only the Initiator change the team", async () => {
    const { mine } = await twoProjects();
    const { app } = makeApp(db);
    const team = { members: [{ memberId: "mara", role: "Initiator" }, { memberId: "grace", role: "Design" }] };
    expect((await as("grace").fetch(app, "PUT", `/admin/projects/${mine.id}/members`, team)).status).toBe(403);
    expect((await as("mara").fetch(app, "PUT", `/admin/projects/${mine.id}/members`, team)).status).toBe(200);

    // The Initiator can't write themselves out; an admin can hand the project over.
    const handover = { members: [{ memberId: "mara", role: "Design" }, { memberId: "grace", role: "Initiator" }] };
    expect((await as("mara").fetch(app, "PUT", `/admin/projects/${mine.id}/members`, handover)).status).toBe(400);
    expect((await as("mara").fetch(app, "PUT", `/admin/projects/${mine.id}/members`, { members: [] })).status).toBe(400);
    expect((await adminFetch(app, "PUT", `/admin/projects/${mine.id}/members`, handover)).status).toBe(200);
  });

  it("works on deliverables and posts of their projects only", async () => {
    const { mine, theirs } = await twoProjects();
    const { app } = makeApp(db);
    await as("grace").json(app, "POST", `/admin/projects/${mine.id}/deliverables`, { title: "Seed list" });
    expect((await as("grace").fetch(app, "POST", `/admin/projects/${theirs.id}/deliverables`, { title: "x" })).status).toBe(404);

    const [own, other] = await db
      .insert(posts)
      .values([
        { projectId: mine.id, kind: "kickoff", dueOn: "2026-10-03" },
        { projectId: theirs.id, kind: "kickoff", dueOn: "2026-10-03" },
      ])
      .returning();
    expect((await as("grace").json(app, "GET", "/admin/posts")).map((p: { id: string }) => p.id)).toEqual([own!.id]);
    expect((await as("grace").json(app, "GET", "/admin/posts/board")).lanes.map((l: { project: { slug: string } }) => l.project.slug)).toEqual(["kiez"]);
    expect((await as("grace").fetch(app, "PATCH", `/admin/posts/${own!.id}`, { brief: "We met." })).status).toBe(200);
    expect((await as("grace").fetch(app, "GET", `/admin/posts/${other!.id}`)).status).toBe(404);
    expect((await as("grace").fetch(app, "PATCH", `/admin/posts/${other!.id}`, { brief: "x" })).status).toBe(404);
  });

  it("has nothing to see on the admin side", async () => {
    await twoProjects();
    const { app } = makeApp(db);
    for (const path of ["/admin/submissions", "/admin/outbox", "/admin/documents", "/admin/finance"]) {
      expect((await as("grace").fetch(app, "GET", path)).status, path).toBe(403);
    }
  });
});

describe("project files", () => {
  async function upload(app: Parameters<typeof adminFetch>[0], files: FakeFiles, memberId: string, projectId: string, title: string) {
    const ticket = await as(memberId).json(app, "POST", `/admin/projects/${projectId}/files/upload`, {
      filename: `${title}.pdf`,
      contentType: "application/pdf",
      size: 10,
    });
    files.privateFiles.set(ticket.pathname, { contentType: "application/pdf", body: `%PDF ${title}` });
    return as(memberId).json(app, "POST", `/admin/projects/${projectId}/files`, { pathname: ticket.pathname, title });
  }

  it("uploads under the member's prefix, lists for the team, and opens the file", async () => {
    const { mine } = await twoProjects();
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const file = await upload(app, files, "grace", mine.id, "Wireframes");
    expect(file).toMatchObject({ title: "Wireframes", kind: "other", owner: "grace", ownerName: "Grace" });
    expect(files.tickets[0]!.request.pathname).toMatch(new RegExp(`^grace/projects/${mine.id}/`));

    const list = await as("mara").json(app, "GET", `/admin/projects/${mine.id}/files`);
    expect(list.map((f: { title: string }) => f.title)).toEqual(["Wireframes"]);
    const opened = await as("mara").fetch(app, "GET", `/admin/projects/${mine.id}/files/${file.id}`);
    expect(opened.status).toBe(200);
    expect(await opened.text()).toBe("%PDF Wireframes");

    // Not in anyone's personal documents.
    expect(await adminJson(app, "GET", "/admin/documents")).toEqual([]);
  });

  it("refuses someone else's upload and another project's", async () => {
    const { mine, theirs } = await twoProjects();
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    files.privateFiles.set(`mara/projects/${mine.id}/x.pdf`, { contentType: "application/pdf", body: "x" });
    expect(
      (await as("grace").fetch(app, "POST", `/admin/projects/${mine.id}/files`, { pathname: `mara/projects/${mine.id}/x.pdf`, title: "x" })).status,
    ).toBe(400);
    files.privateFiles.set(`grace/projects/${theirs.id}/y.pdf`, { contentType: "application/pdf", body: "y" });
    expect(
      (await as("grace").fetch(app, "POST", `/admin/projects/${mine.id}/files`, { pathname: `grace/projects/${theirs.id}/y.pdf`, title: "y" })).status,
    ).toBe(400);
    expect((await as("grace").fetch(app, "GET", `/admin/projects/${theirs.id}/files`)).status).toBe(404);
  });

  it("lets whoever added it, the Initiator or an admin delete a file", async () => {
    const { mine } = await twoProjects();
    await db.insert(projectMembers).values({ projectId: mine.id, memberId: "ada", role: "Design" });
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const byMara = await upload(app, files, "mara", mine.id, "Deck");
    const byGrace = await upload(app, files, "grace", mine.id, "Notes");

    expect((await as("grace").fetch(app, "DELETE", `/admin/projects/${mine.id}/files/${byMara.id}`)).status).toBe(403);
    expect((await as("mara").fetch(app, "DELETE", `/admin/projects/${mine.id}/files/${byGrace.id}`)).status).toBe(200);
    expect((await as("mara").fetch(app, "DELETE", `/admin/projects/${mine.id}/files/${byMara.id}`)).status).toBe(200);
    expect(await db.select().from(documents).where(eq(documents.projectId, mine.id))).toEqual([]);
    expect(files.deletedPrivate).toHaveLength(2);
  });
});
