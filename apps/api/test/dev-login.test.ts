import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, type Database } from "@nw/db";

import { readEnv } from "../src/deps.js";
import { createTestDb, makeApp, postJson, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    { id: "ada", displayName: "Ada", email: "ada@novawerk.io", canAdmin: true },
    { id: "grace", displayName: "Grace", email: "grace@novawerk.io" },
  ]);
});

describe("POST /auth/dev", () => {
  it("is a 404 unless DEV_LOGIN is on", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/auth/dev", postJson({ email: "ada@novawerk.io" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("signs an admin in by email when DEV_LOGIN is on", async () => {
    const { app } = makeApp(db, { env: { devLogin: true } });
    const res = await app.request("/auth/dev", postJson({ email: "ADA@novawerk.io" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/nw_session=/);
    expect(await res.json()).toMatchObject({ id: "ada", canAdmin: true });
  });

  it("signs in any active member, and refuses everyone else", async () => {
    const { app } = makeApp(db, { env: { devLogin: true } });
    expect((await app.request("/auth/dev", postJson({ email: "grace@novawerk.io" }))).status).toBe(200);
    expect((await app.request("/auth/dev", postJson({ email: "linus@novawerk.io" }))).status).toBe(403);
    expect((await app.request("/auth/dev", postJson({ email: "nobody@example.org" }))).status).toBe(403);
  });
});

describe("DEV_LOGIN in readEnv", () => {
  const required = {
    DATABASE_URL: "postgres://localhost/test",
    GOOGLE_CLIENT_ID: "client",
    SESSION_SECRET: "x".repeat(40),
  };

  it("turns dev login on locally", () => {
    expect(readEnv({ ...required, DEV_LOGIN: "true" }).config.devLogin).toBe(true);
  });

  it("is off by default", () => {
    expect(readEnv(required).config.devLogin).toBeUndefined();
  });

  it("refuses to start with DEV_LOGIN on Vercel or in production", () => {
    expect(() => readEnv({ ...required, DEV_LOGIN: "true", VERCEL: "1" })).toThrow(/DEV_LOGIN/);
    expect(() => readEnv({ ...required, DEV_LOGIN: "true", NODE_ENV: "production" })).toThrow(/DEV_LOGIN/);
  });
});
