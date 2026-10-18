// The GitHub that local development runs without our App (src/dev-github.ts): signing in and
// linking through its authorize page, pull requests that move tasks like the webhook, and
// linking a PR by hand.

import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, tasks, type Database } from "@nw/db";

import { DevGitHub, devGitHubId } from "../src/dev-github.js";
import { readEnv } from "../src/deps.js";
import { TEST_CONFIG, WEB_ORIGIN, contributorCookie, createTestDb, makeApp, resetDb, TEST_MEMBERS, type TestApp } from "./helpers.js";

const API = TEST_CONFIG.publicUrls.apiUrl;

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});

let gh: DevGitHub;
let app: TestApp;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  gh = new DevGitHub(API);
  app = makeApp(db, { devGitHub: gh }).app;
});

const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0];

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

describe("the local GitHub", () => {
  it("is off without it", async () => {
    expect((await makeApp(db).app.request("/dev/github")).status).toBe(404);
    expect((await makeApp(db).app.request("/dev/github/authorize")).status).toBe(404);
  });

  it("signs in through its authorize page, with a stable id per login", async () => {
    const start = await app.request("/auth/github/start?returnTo=/tasks");
    const authorize = new URL(start.headers.get("location")!);
    expect(authorize.origin + authorize.pathname).toBe(`${API}/dev/github/authorize`);

    const page = await app.request(authorize.pathname + authorize.search);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("GitHub login");
    // Only our own callback.
    expect((await app.request("/dev/github/authorize?state=x&redirect_uri=https://evil.example/cb")).status).toBe(400);

    const callback = await app.request(
      `/auth/github/callback?code=dev-octo&state=${authorize.searchParams.get("state")}`,
      { headers: { Cookie: cookieOf(start, "nw_github_state")! } },
    );
    expect(callback.status).toBe(302);
    expect(cookieOf(callback, "nw_session")).toBeTruthy();
    const [me] = await db.select().from(members).where(eq(members.githubLogin, "dev-octo"));
    expect(me?.githubId).toBe(devGitHubId("dev-octo"));
    expect(devGitHubId("Dev-Octo")).toBe(devGitHubId("dev-octo"));
  });

  it("knows the seeded contributor Lena, so a local sign-in as lena-k is her", () => {
    const seed = readFileSync(new URL("../../../packages/db/seed.dev.sql", import.meta.url), "utf8");
    expect(seed).toContain(`${devGitHubId("lena-k")}, 'lena-k'`);
  });

  it("moves a task with pull requests, and links one by hand", async () => {
    const [lena] = await db
      .insert(members)
      .values({ handle: "lena-k", displayName: "Lena", githubId: devGitHubId("lena-k"), githubLogin: "lena-k" })
      .returning();
    const assigned = async (title: string) =>
      (
        await db
          .insert(tasks)
          .values({ title, area: "web", size: "S", status: "assigned", assigneeId: lena!.id, assignedAt: new Date() })
          .returning()
      )[0]!;
    const status = async (id: number) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0]?.status;

    const t = await assigned("Dark mode");
    const opened = await app.request("/dev/github/pulls", form({ login: "lena-k", title: "Web: dark mode", body: `Task: NW-${t.id}` }));
    expect(opened.status).toBe(303);
    expect(await status(t.id)).toBe("in_review");
    expect(gh.replies.map((r) => r.text)).toEqual([expect.stringContaining(`NW-${t.id}`), "Labels: size:S"]);

    expect((await app.request("/dev/github/pulls/1/merge", { method: "POST" })).status).toBe(303);
    expect(await status(t.id)).toBe("done");

    // A PR whose webhook never came, linked from the task page.
    const other = await assigned("Light mode");
    gh.open({ login: "lena-k", title: "Web: light mode", body: `Task: NW-${other.id}`, branch: "light" });
    expect(await status(other.id)).toBe("assigned");
    const res = await app.request(`/contrib/tasks/NW-${other.id}/pr`, {
      method: "POST",
      headers: { Cookie: await contributorCookie(lena!.id), Origin: WEB_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://github.com/Novawerk/novawerk-workspace/pull/2" }),
    });
    expect(res.status).toBe(200);
    expect(await status(other.id)).toBe("in_review");
  });
});

describe("readEnv with DEV_LOGIN", () => {
  const required = { DATABASE_URL: "postgres://localhost/test", GOOGLE_CLIENT_ID: "client", SESSION_SECRET: "x".repeat(40) };

  it("points the links at this machine unless they are set", () => {
    expect(readEnv({ ...required, DEV_LOGIN: "true", PORT: "9000" }).config.publicUrls).toEqual({
      apiUrl: "http://localhost:9000",
      webUrl: "http://localhost:3000",
    });
    expect(readEnv(required).config.publicUrls.apiUrl).toBe("https://api.novawerk.io");
  });
});
