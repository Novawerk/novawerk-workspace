// Suggestion screenshots: private until a member accepts the suggestion, public then without
// metadata, deleted on decline, duplicate, account deletion, or when never sent.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, tasks, type Database } from "@nw/db";

import { deleteUnsentScreenshots, finishTriagedScreenshots } from "../src/screenshot-cleanup.js";
import { FakeFiles, TEST_MEMBERS, WEB_ORIGIN, adminFetch, contributorCookie, createTestDb, makeApp, resetDb, type TestApp } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});

let lenaId: string;
let cookie: string;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  const [lena] = await db.insert(members).values({ handle: "lena-k", displayName: "Lena", githubId: 1 }).returning();
  lenaId = lena!.id;
  cookie = await contributorCookie(lenaId);
});

/** A tiny PNG with a text chunk carrying personal data. */
function pngWithMetadata(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.alloc(13, 1)),
    chunk("tEXt", Buffer.from("Author\0Lena Krause, Kreuzberg")),
    chunk("IDAT", Buffer.from("pixels")),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function call(app: TestApp, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { Cookie: cookie, Origin: WEB_ORIGIN, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const suggestion = (screenshot?: string) => ({
  title: "Chips overflow",
  kind: "bug",
  body: "On a phone the status chips overflow the screen.",
  where: "site",
  ...(screenshot ? { screenshot: { pathname: screenshot } } : {}),
});

/** A ticket, then the upload the browser would make. */
async function upload(app: TestApp, files: FakeFiles, body: Buffer = pngWithMetadata(), contentType = "image/png") {
  const ticket = await call(app, "POST", "/contrib/uploads/suggestion-screenshot", { filename: "Screen Shot.png", contentType: "image/png" });
  expect(ticket.status).toBe(200);
  files.privateFiles.set(ticket.body.pathname, { contentType, body });
  return ticket.body.pathname as string;
}

describe("suggestion screenshots", () => {
  it.each(["haodong", "legacy-user", "old--id-"])(
    "accepts screenshots from a member whose legacy id is %s",
    async (id) => {
      const [legacy] = await db.insert(members).values({
        id,
        handle: id,
        displayName: "Legacy User",
      }).returning();

      cookie = await contributorCookie(legacy!.id);

      const files = new FakeFiles();
      const { app } = makeApp(db, { files });
      const pathname = await upload(app, files);

      expect((await call(app, "POST", "/contrib/suggestions", suggestion(pathname))).status).toBe(201);
    },
  );

  it("hands out private tickets under the caller's folder, up to 10 an hour", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    expect(pathname).toMatch(new RegExp(`^_suggestions/${lenaId}/[0-9a-f-]{36}-screen-shot\\.png$`));
    expect(files.tickets[0]).toMatchObject({ access: "private", request: { contentTypes: ["image/png"], maxBytes: 2 * 1024 * 1024 } });
    for (let i = 0; i < 9; i++) await call(app, "POST", "/contrib/uploads/suggestion-screenshot", { filename: "a.png", contentType: "image/png" });
    expect((await call(app, "POST", "/contrib/uploads/suggestion-screenshot", { filename: "a.png", contentType: "image/png" })).status).toBe(429);
    expect((await call(app, "POST", "/contrib/uploads/suggestion-screenshot", { filename: "a.gif", contentType: "image/gif" })).status).toBe(400);
    expect((await call(makeApp(db, { files: new FakeFiles({ private: false }) }).app, "POST", "/contrib/uploads/suggestion-screenshot", { filename: "a.png", contentType: "image/png" })).status).toBe(503);
  });

  it("takes only the caller's own upload, present and a real PNG or JPEG", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const someoneElses = `_suggestions/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}/${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}-x.png`;
    files.privateFiles.set(someoneElses, { contentType: "image/png", body: pngWithMetadata() });
    expect((await call(app, "POST", "/contrib/suggestions", suggestion(someoneElses))).body.issues.screenshot).toBeDefined();
    const pathname = await upload(app, files, Buffer.from("x"), "image/gif");
    expect((await call(app, "POST", "/contrib/suggestions", suggestion(pathname))).status).toBe(400);
    files.privateFiles.delete(pathname);
    expect((await call(app, "POST", "/contrib/suggestions", suggestion(pathname))).status).toBe(400);
  });

  it("stays private until accepted, then goes public without its metadata", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const created = await call(app, "POST", "/contrib/suggestions", suggestion(pathname));
    expect(created.status).toBe(201);
    expect((await call(app, "GET", `/public/tasks/${created.body.id}`)).body.screenshotUrl).toBeNull();

    // Members see it in triage.
    const triage = await adminFetch(app, "GET", `/admin/suggestions/${created.body.id}/screenshot`);
    expect(triage.status).toBe(200);
    expect(triage.headers.get("cache-control")).toBe("private, no-store");

    await adminFetch(app, "POST", `/admin/suggestions/${created.body.id}/accept`, { area: "web", size: "S", criteria: ["Chips scroll"] });
    const [stored] = [...files.publicFiles.values()];
    expect(stored!.contentType).toBe("image/png");
    expect(stored!.body.toString("latin1")).not.toContain("Kreuzberg");
    expect(stored!.body.toString("latin1")).toContain("pixels");
    expect(files.deletedPrivate).toContain(pathname);
    expect((await call(app, "GET", `/public/tasks/${created.body.id}`)).body.screenshotUrl).toMatch(/^https:\/\/public\.blob\.example\/tasks\/NW-\d+\/screenshot-/);
    expect((await adminFetch(app, "GET", `/admin/suggestions/${created.body.id}/screenshot`)).status).toBe(404);
  });

  it("is deleted when the suggestion is declined", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const created = await call(app, "POST", "/contrib/suggestions", suggestion(pathname));
    await adminFetch(app, "POST", `/admin/suggestions/${created.body.id}/decline`, { note: "Not for now" });
    expect(files.deletedPrivate).toContain(pathname);
    expect(files.publicFiles.size).toBe(0);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, created.body.number));
    expect(row).toMatchObject({ screenshotPathname: null, screenshotUrl: null });
  });

  it("goes with the account, and when never sent", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const sent = await upload(app, files);
    await call(app, "POST", "/contrib/suggestions", suggestion(sent));
    const unsent = await upload(app, files);
    const dayAgo = new Date(Date.now() - 25 * 3_600_000);
    files.privateFiles.set(unsent, { ...files.privateFiles.get(unsent)!, uploadedAt: dayAgo });
    files.privateFiles.set(sent, { ...files.privateFiles.get(sent)!, uploadedAt: dayAgo });
    expect(await deleteUnsentScreenshots(db, files)).toBe(1);
    expect(files.deletedPrivate).toEqual([unsent]);

    await call(app, "DELETE", "/contrib/me", { confirmHandle: "lena-k" });
    expect(files.deletedPrivate).toContain(sent);
  });
});

describe("review fixes", () => {
  it("still signs out and answers 200 when the file store fails during account deletion", async () => {
    const files = new FakeFiles();
    files.listPrivate = async () => {
      throw new Error("Blob is down");
    };
    const { app } = makeApp(db, { files });
    const res = await app.request("/contrib/me", {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: WEB_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmHandle: "lena-k" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/nw_session=;/);
  });

  it("attaches one upload to one suggestion, and forgets it with the account", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const first = await call(app, "POST", "/contrib/suggestions", suggestion(pathname));
    expect(first.status).toBe(201);
    const again = await call(app, "POST", "/contrib/suggestions", { ...suggestion(pathname), title: "Again" });
    expect(again.status).toBe(400);
    expect(again.body.issues.screenshot).toBeDefined();

    await call(app, "DELETE", "/contrib/me", { confirmHandle: "lena-k" });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, first.body.number));
    expect(row?.screenshotPathname).toBeNull();
  });

  it("keeps a screenshot private when the public copy fails, and publishes it the next night", async () => {
    const files = new FakeFiles();
    const putPublic = files.putPublic.bind(files);
    let fail = true;
    files.putPublic = async (...args) => {
      if (fail) throw new Error("Blob hiccup");
      return putPublic(...args);
    };
    const { app, logger } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const created = await call(app, "POST", "/contrib/suggestions", suggestion(pathname));
    await adminFetch(app, "POST", `/admin/suggestions/${created.body.id}/accept`, { area: "web", size: "S", criteria: ["Done"] });
    expect(logger.error).toHaveBeenCalled();
    let [row] = await db.select().from(tasks).where(eq(tasks.id, created.body.number));
    expect(row).toMatchObject({ screenshotPathname: pathname, screenshotUrl: null });

    fail = false;
    expect(await finishTriagedScreenshots(db, files, logger)).toEqual({ published: 1, deleted: 0 });
    [row] = await db.select().from(tasks).where(eq(tasks.id, created.body.number));
    expect(row?.screenshotPathname).toBeNull();
    expect(row?.screenshotUrl).toMatch(/^https:\/\/public\.blob\.example\//);
  });

  it("types the public copy by its bytes, and deletes one it can't read instead of publishing it", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    // A JPEG declared as PNG: published as a JPEG, without its EXIF.
    const seg = (marker: number, data: Buffer) => {
      const head = Buffer.from([0xff, marker, 0, 0]);
      head.writeUInt16BE(data.length + 2, 2);
      return Buffer.concat([head, data]);
    };
    const jpegWithGps = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      seg(0xe1, Buffer.from("Exif\0\0GPS 52.52N")),
      seg(0xc0, Buffer.alloc(15)),
      seg(0xc4, Buffer.from("table")),
      seg(0xda, Buffer.alloc(10)),
      Buffer.from("scan"),
      Buffer.from([0xff, 0xd9]),
    ]);
    const pathname = await upload(app, files, jpegWithGps, "image/png");
    const created = await call(app, "POST", "/contrib/suggestions", suggestion(pathname));
    await adminFetch(app, "POST", `/admin/suggestions/${created.body.id}/accept`, { area: "web", size: "S", criteria: ["Done"] });
    const [stored] = [...files.publicFiles.entries()];
    expect(stored![0]).toMatch(/\.jpg$/);
    expect(stored![1].contentType).toBe("image/jpeg");
    expect(stored![1].body.toString("latin1")).not.toContain("GPS");

    const junk = await upload(app, files, Buffer.from("\x89PNG\r\n\x1a\nnot really"), "image/png");
    const second = await call(app, "POST", "/contrib/suggestions", { ...suggestion(junk), title: "Second" });
    await adminFetch(app, "POST", `/admin/suggestions/${second.body.id}/accept`, { area: "web", size: "S", criteria: ["Done"] });
    expect(files.publicFiles.size).toBe(1);
    expect(files.deletedPrivate).toContain(junk);
  });
});
