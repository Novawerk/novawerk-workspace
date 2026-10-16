// Files in Vercel Blob, through a fake store: upload tickets, the per-member prefix, who can open
// and delete a document, and cleaning up pictures a project no longer uses.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "@nw/contracts";
import { documents, financeLedger, members, projects, type Database } from "@nw/db";

import { FakeFiles, TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    ...TEST_MEMBERS,
    { id: "mara", handle: "mara", displayName: "Mara", email: "mara@novawerk.io", role: "maintainer" },
  ]);
});

const BLOB = "https://abc.public.blob.vercel-storage.com";

describe("POST /admin/uploads/image", () => {
  it("issues a ticket for one picture under projects/", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const ticket = await adminJson(app, "POST", "/admin/uploads/image", {
      filename: "Kiez Pantry cover.PNG",
      contentType: "image/png",
      size: 120_000,
    });
    expect(ticket).toMatchObject({ token: "client-token-1", access: "public" });
    expect(ticket.pathname).toMatch(/^projects\/[0-9a-f-]{36}-kiez-pantry-cover\.png$/);
    expect(files.tickets[0]).toEqual({
      access: "public",
      request: { pathname: ticket.pathname, contentTypes: ["image/png"], maxBytes: MAX_IMAGE_BYTES },
    });
  });

  it("refuses other types, big files, and answers 503 without the store", async () => {
    const { app } = makeApp(db, { files: new FakeFiles() });
    expect((await adminFetch(app, "POST", "/admin/uploads/image", { filename: "a.pdf", contentType: "application/pdf", size: 1 })).status).toBe(400);
    expect((await adminFetch(app, "POST", "/admin/uploads/image", { filename: "a.png", contentType: "image/svg+xml", size: 1 })).status).toBe(400);
    expect(
      (await adminFetch(app, "POST", "/admin/uploads/image", { filename: "a.png", contentType: "image/png", size: MAX_IMAGE_BYTES + 1 })).status,
    ).toBe(400);

    const off = makeApp(db, { files: new FakeFiles({ public: false }) }).app;
    const res = await adminFetch(off, "POST", "/admin/uploads/image", { filename: "a.png", contentType: "image/png", size: 1 });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("BLOB_PUBLIC_READ_WRITE_TOKEN");
    expect((await adminFetch(makeApp(db).app, "POST", "/admin/uploads/image", { filename: "a.png", contentType: "image/png", size: 1 })).status).toBe(503);
  });
});

describe("documents", () => {
  async function upload(app: ReturnType<typeof makeApp>["app"], files: FakeFiles, filename = "Grant agreement.pdf", contentType = "application/pdf") {
    const ticket = await adminJson(app, "POST", "/admin/documents/upload", { filename, contentType, size: 2_000 });
    files.privateFiles.set(ticket.pathname, { contentType, body: "%PDF-1.7 hello" });
    return ticket.pathname as string;
  }

  it("uploads under the member's own prefix and records the file", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    expect(pathname).toMatch(/^ada\/[0-9a-f-]{36}-grant-agreement\.pdf$/);
    expect(files.tickets[0]).toMatchObject({
      access: "private",
      request: { contentTypes: ["application/pdf"], maxBytes: MAX_DOCUMENT_BYTES },
    });

    const row = await adminJson(
      app,
      "POST",
      "/admin/documents",
      { pathname, kind: "contract", title: "Kiez Fonds grant agreement", counterparty: "Kiez Fonds", signedOn: "2026-09-10" },
      201,
    );
    expect(row).toMatchObject({ kind: "contract", owner: "ada", r2Key: pathname, counterparty: "Kiez Fonds", signedOn: "2026-09-10" });

    const again = await adminFetch(app, "POST", "/admin/documents", { pathname, kind: "contract", title: "Again" });
    expect(again.status).toBe(409);
  });

  it("refuses someone else's prefix and files that were never uploaded", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    files.privateFiles.set("mara/x.pdf", { contentType: "application/pdf", body: "x" });
    const theirs = await adminFetch(app, "POST", "/admin/documents", { pathname: "mara/x.pdf", kind: "nda", title: "Not mine" });
    expect(theirs.status).toBe(400);
    expect(await theirs.json()).toMatchObject({ issues: { pathname: ["That upload isn't yours"] } });
    const sneaky = await adminFetch(app, "POST", "/admin/documents", { pathname: "ada-evil/x.pdf", kind: "nda", title: "x" });
    expect(sneaky.status).toBe(400);
    const missing = await adminFetch(app, "POST", "/admin/documents", { pathname: "ada/nothing.pdf", kind: "nda", title: "x" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ issues: { pathname: [expect.stringContaining("Upload it again")] } });
    expect(await db.select().from(documents)).toEqual([]);
  });

  it("streams the file to its owner, inline for PDFs, with a safe filename", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const row = await adminJson(app, "POST", "/admin/documents", { pathname, kind: "contract", title: "Grant (signed)" }, 201);

    const res = await adminFetch(app, "GET", `/admin/documents/${row.id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      `inline; filename="Grant (signed).pdf"; filename*=UTF-8''Grant%20(signed).pdf`,
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("%PDF-1.7 hello");

    // Another admin can't see it, let alone open it.
    expect((await adminFetch(app, "GET", `/admin/documents/${row.id}/file`, undefined, "mara")).status).toBe(404);
    expect(await adminJson(makeApp(db, { files }).app, "GET", "/admin/documents")).toHaveLength(1);
  });

  it("downloads Word files instead of showing them", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const pathname = await upload(app, files, "Vertrag.docx", type);
    const row = await adminJson(app, "POST", "/admin/documents", { pathname, kind: "contract", title: "Vertrag" }, 201);
    const res = await adminFetch(app, "GET", `/admin/documents/${row.id}/file`);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="Vertrag\.docx"/);
  });

  it("deletes your own document and its file; the ledger keeps the entry", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    const pathname = await upload(app, files);
    const row = await adminJson(app, "POST", "/admin/documents", { pathname, kind: "receipt", title: "Receipt" }, 201);
    await adminJson(app, "POST", "/admin/finance", { entryDate: "2026-10-01", direction: "out", amountCents: 1999, receiptDocumentId: row.id }, 201);

    expect((await adminFetch(app, "DELETE", `/admin/documents/${row.id}`, undefined, "mara")).status).toBe(404);
    expect(await adminJson(app, "DELETE", `/admin/documents/${row.id}`)).toEqual({ ok: true });
    expect(files.deletedPrivate).toEqual([pathname]);
    const [entry] = await db.select().from(financeLedger);
    expect(entry).toMatchObject({ amountCents: 1999, receiptDocumentId: null });
  });

  it("anyone may open or delete Novawerk's own (unowned) documents", async () => {
    const files = new FakeFiles();
    files.privateFiles.set("novawerk/invoice.pdf", { contentType: "application/pdf", body: "x" });
    const [row] = await db.insert(documents).values({ kind: "invoice", title: "Invoice", r2Key: "novawerk/invoice.pdf" }).returning();
    const { app } = makeApp(db, { files });
    expect((await adminFetch(app, "GET", `/admin/documents/${row!.id}/file`, undefined, "mara")).status).toBe(200);
    expect((await adminFetch(app, "DELETE", `/admin/documents/${row!.id}`, undefined, "mara")).status).toBe(200);
  });

  it("answers 503 for uploads and files when the private store is off", async () => {
    const { app } = makeApp(db, { files: new FakeFiles({ private: false }) });
    expect((await adminFetch(app, "POST", "/admin/documents/upload", { filename: "a.pdf", contentType: "application/pdf", size: 1 })).status).toBe(503);
    const [row] = await db.insert(documents).values({ kind: "other", title: "x", r2Key: "ada/x.pdf", owner: "ada" }).returning();
    expect((await adminFetch(app, "GET", `/admin/documents/${row!.id}/file`)).status).toBe(503);
  });
});

describe("project pictures", () => {
  it("deletes a replaced cover and removed gallery pictures, unless another project uses them", async () => {
    const files = new FakeFiles();
    const { app } = makeApp(db, { files });
    await db.insert(projects).values({ slug: "other", title: "Other", coverUrl: `${BLOB}/projects/shared.png` });
    const { project } = await adminJson(
      app,
      "POST",
      "/admin/projects",
      {
        slug: "kiez-pantry",
        title: "Kiez Pantry",
        coverUrl: `${BLOB}/projects/old.png`,
        gallery: [{ url: `${BLOB}/projects/g1.png`, caption: "Bread" }, { url: `${BLOB}/projects/shared.png` }],
      },
      201,
    );
    expect(project.gallery).toEqual([{ url: `${BLOB}/projects/g1.png`, caption: "Bread" }, { url: `${BLOB}/projects/shared.png` }]);

    await adminJson(app, "PATCH", `/admin/projects/${project.id}`, {
      coverUrl: `${BLOB}/projects/new.png`,
      gallery: [],
    });
    expect(files.deletedPublic.sort()).toEqual([`${BLOB}/projects/g1.png`, `${BLOB}/projects/old.png`]);

    files.deletedPublic.length = 0;
    await adminJson(app, "DELETE", `/admin/projects/${project.id}`);
    expect(files.deletedPublic).toEqual([`${BLOB}/projects/new.png`]);
    const [other] = await db.select().from(projects).where(eq(projects.slug, "other"));
    expect(other!.coverUrl).toBe(`${BLOB}/projects/shared.png`);
  });

  it("validates gallery links", async () => {
    const { app } = makeApp(db);
    const res = await adminFetch(app, "POST", "/admin/projects", { slug: "xx", title: "X", gallery: [{ url: "http://x.org/a.png" }] });
    expect(res.status).toBe(400);
  });
});
