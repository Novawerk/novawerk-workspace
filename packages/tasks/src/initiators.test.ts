// Members who started a project and opted in to a public profile stand on the contributors wall
// (NB-ADR-0013): off by default, a shared handle namespace, public projects only, no email.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { contributorListQuery } from "@nw/contracts";
import { members, projectMembers, projects, tasks, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  TaskRuleError,
  getPublicContributor,
  listPublicContributors,
  listPublicInitiators,
  signInWithGitHub,
  claimMemberId,
  extendTask,
  updateMemberProfile,
  updateProfile,
} from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    { id: "jonas", displayName: "Jonas Weber", email: "jonas@novawerk.io" },
    { id: "mara", displayName: "Mara Lindqvist", email: "mara@novawerk.io" },
  ]);
  const [quiet, draft] = await db
    .insert(projects)
    .values([
      { slug: "quiet-desk", title: "Quiet Desk", status: "building", createdAt: new Date("2026-09-01") },
      { slug: "secret", title: "Secret draft", status: "draft", createdAt: new Date("2026-10-01") },
    ])
    .returning();
  await db.insert(projectMembers).values([
    { projectId: quiet!.id, memberId: "jonas", role: "Initiator" },
    { projectId: draft!.id, memberId: "mara", role: "Initiator" },
    { projectId: quiet!.id, memberId: "mara", role: "Design" },
  ]);
});

const wall = async (q: Record<string, string> = {}) => (await listPublicContributors(db, contributorListQuery.parse(q))).contributors;

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TaskRuleError) return e.code;
    throw e;
  }
  return "ok";
}

describe("a member's public profile", () => {
  it("is off by default and needs a handle to switch on", async () => {
    expect(await wall()).toEqual([]);
    expect(await code(() => updateMemberProfile(db, "jonas", { publicProfile: true }))).toBe("invalid");
    const row = await updateMemberProfile(db, "jonas", { publicProfile: true, profileHandle: "jonas-w", profileBio: "Wished for Quiet Desk" });
    expect(row).toMatchObject({ publicProfile: true, profileHandle: "jonas-w" });
  });

  it("shares the handle namespace with contributors, both ways", async () => {
    const lena = await signInWithGitHub(db, { id: 1, login: "lena-k", name: null, avatarUrl: null });
    expect(await code(() => updateMemberProfile(db, "jonas", { profileHandle: "lena-k" }))).toBe("conflict");
    await updateMemberProfile(db, "jonas", { profileHandle: "jonas-w" });
    expect(await code(() => updateMemberProfile(db, "mara", { profileHandle: "jonas-w" }))).toBe("conflict");
    expect(await code(() => updateProfile(db, lena.id, { handle: "jonas-w" }))).toBe("conflict");
    const newcomer = await signInWithGitHub(db, { id: 2, login: "jonas-w", name: null, avatarUrl: null });
    expect(newcomer.handle).toBe("jonas-w-2");
  });
});

describe("initiators on the wall", () => {
  it("shows an opted-in initiator with their public project, next to contributors, never their email", async () => {
    await updateMemberProfile(db, "jonas", { publicProfile: true, profileHandle: "jonas-w" });
    await updateMemberProfile(db, "mara", { publicProfile: true, profileHandle: "mara" }); // only a draft project
    const lena = await signInWithGitHub(db, { id: 1, login: "lena-k", name: "Lena", avatarUrl: null });
    await updateProfile(db, lena.id, { public: true });
    await db.insert(tasks).values({ title: "Done", status: "done", assigneeId: lena.id, area: "web", doneAt: new Date("2026-10-05") });

    const cards = await wall();
    expect(cards.map((c) => [c.kind, c.handle, c.project])).toEqual([
      ["contributor", "lena-k", null],
      ["initiator", "jonas-w", { slug: "quiet-desk", title: "Quiet Desk" }],
    ]);
    expect(JSON.stringify(cards)).not.toContain("@novawerk.io");
    expect((await wall({ sort: "az" })).map((c) => c.handle)).toEqual(["jonas-w", "lena-k"]);
    expect((await wall({ area: "web" })).map((c) => c.handle)).toEqual(["lena-k"]); // initiators have no areas

    const page1 = await listPublicContributors(db, contributorListQuery.parse({ limit: "1" }));
    const page2 = await listPublicContributors(db, contributorListQuery.parse({ limit: "1", cursor: page1.nextCursor }));
    expect([...page1.contributors, ...page2.contributors].map((c) => c.handle)).toEqual(["lena-k", "jonas-w"]);
    expect(page2.nextCursor).toBeNull();

    expect(await listPublicInitiators(db)).toEqual([
      { handle: "jonas-w", name: "Jonas Weber", project: { slug: "quiet-desk", title: "Quiet Desk" }, startedAt: expect.any(String) },
    ]);
  });

  it("serves their profile at the handle, and nothing once they switch it off or leave", async () => {
    await updateMemberProfile(db, "jonas", { publicProfile: true, profileHandle: "jonas-w" });
    expect(await getPublicContributor(db, "jonas-w")).toMatchObject({
      kind: "initiator",
      name: "Jonas Weber",
      projects: [{ slug: "quiet-desk", title: "Quiet Desk" }],
      stats: { done: 0, inProgress: 0, werk: 0 },
    });
    expect(JSON.stringify(await getPublicContributor(db, "jonas-w"))).not.toContain("@");
    await updateMemberProfile(db, "jonas", { publicProfile: false });
    expect(await getPublicContributor(db, "jonas-w")).toBeNull();
    expect(await wall()).toEqual([]);

    await updateMemberProfile(db, "jonas", { publicProfile: true });
    await db.update(members).set({ active: false }).where(eq(members.id, "jonas"));
    expect(await getPublicContributor(db, "jonas-w")).toBeNull();
    expect(await listPublicInitiators(db)).toEqual([]);
  });
});

describe("review fixes", () => {
  it("keeps member ids out of the wall's cursor", async () => {
    await updateMemberProfile(db, "jonas", { publicProfile: true, profileHandle: "j-weber" });
    const lena = await signInWithGitHub(db, { id: 1, login: "lena-k", name: "Lena", avatarUrl: null });
    await updateProfile(db, lena.id, { public: true });
    await db.insert(tasks).values({ title: "Done", status: "done", assigneeId: lena.id, area: "web", doneAt: new Date("2026-10-05") });
    for (const sort of ["newest", "az"]) {
      const page = await listPublicContributors(db, contributorListQuery.parse({ sort, limit: "1" }));
      const decoded = JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString("utf8")) as string[];
      expect(decoded).not.toContain("jonas");
      expect(decoded).not.toContain(lena.id);
      expect(decoded.at(-1)).toMatch(/^(lena-k|j-weber)$/);
    }
  });

  it("shows an initiator's profile only with a public project, and matches the role loosely", async () => {
    await updateMemberProfile(db, "mara", { publicProfile: true, profileHandle: "mara-l" }); // a draft project only
    expect(await getPublicContributor(db, "mara-l")).toBeNull();
    await db.update(projectMembers).set({ role: " initiator " }).where(eq(projectMembers.memberId, "jonas"));
    await updateMemberProfile(db, "jonas", { publicProfile: true, profileHandle: "j-weber" });
    expect((await wall()).map((c) => c.handle)).toEqual(["j-weber"]);
  });

  it("reserves words, the board's prefixes and members' ids", async () => {
    const lena = await signInWithGitHub(db, { id: 1, login: "lena-k", name: null, avatarUrl: null });
    for (const handle of ["admin", "tasks", "anon-1234", "contributor-abcd"]) {
      expect(await code(() => updateProfile(db, lena.id, { handle }))).toBe("invalid");
      expect(await code(() => updateMemberProfile(db, "jonas", { profileHandle: handle }))).toBe("invalid");
    }
    expect(await code(() => updateProfile(db, lena.id, { handle: "mara" }))).toBe("conflict"); // a member's id
    expect(await code(() => updateMemberProfile(db, "jonas", { profileHandle: "mara" }))).toBe("conflict");
    expect(await code(() => updateMemberProfile(db, "jonas", { profileHandle: "jonas" }))).toBe("ok"); // their own id
    expect((await signInWithGitHub(db, { id: 2, login: "admin", name: null, avatarUrl: null })).handle).toBe("gh-admin");
    // Reserved words that are also prefixes once numbered ("anon-2" starts with "anon-") never hang.
    expect((await signInWithGitHub(db, { id: 5, login: "anon", name: null, avatarUrl: null })).handle).toBe("gh-anon");
    expect((await signInWithGitHub(db, { id: 6, login: "Anon", name: null, avatarUrl: null })).handle).toBe("gh-anon-2");
    expect((await signInWithGitHub(db, { id: 7, login: "contributor", name: null, avatarUrl: null })).handle).toBe("gh-contributor");
    expect((await signInWithGitHub(db, { id: 3, login: "anon-bob", name: null, avatarUrl: null })).handle).toBe("gh-anon-bob");
    expect((await signInWithGitHub(db, { id: 4, login: "mara", name: null, avatarUrl: null })).handle).toBe("mara-2");
  });

  it("gives a handle asked for twice at once to one person", async () => {
    const a = await signInWithGitHub(db, { id: 1, login: "a-person", name: null, avatarUrl: null });
    const results = await Promise.all([
      code(() => updateProfile(db, a.id, { handle: "same-one" })),
      code(() => updateMemberProfile(db, "jonas", { profileHandle: "same-one" })),
      code(() => updateMemberProfile(db, "mara", { profileHandle: "same-one" })),
    ]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "conflict")).toHaveLength(2);
  });
});

describe("new member ids", () => {
  it("refuses a typed reserved id, prefixes a generated one, and counts past contributors' handles", async () => {
    await signInWithGitHub(db, { id: 1, login: "lena-k", name: null, avatarUrl: null });
    const claim = (wanted: string, exact: boolean) => db.transaction((tx) => claimMemberId(tx, wanted, { exact, field: "id" }));
    expect(await code(() => claim("admin", true))).toBe("invalid");
    expect(await code(() => claim("anon-1", true))).toBe("invalid");
    expect(await claim("admin", false)).toBe("member-admin");
    expect(await claim("anon", false)).toBe("member-anon");
    expect(await claim("lena-k", false)).toBe("lena-k-2");
    expect(await code(() => claim("lena-k", true))).toBe("conflict");
  });
});

describe("a week more", () => {
  it("says so clearly when the task isn't theirs any more", async () => {
    const lena = await signInWithGitHub(db, { id: 1, login: "lena-k", name: null, avatarUrl: null });
    const [t] = await db.insert(tasks).values({ title: "Held", status: "assigned", assigneeId: lena.id, assignedAt: new Date() }).returning();
    await db.update(tasks).set({ status: "open", assigneeId: null }).where(eq(tasks.id, t!.id));
    expect(await code(() => extendTask(db, lena, t!.id))).toMatch(/forbidden|invalid_state/);
  });
});
