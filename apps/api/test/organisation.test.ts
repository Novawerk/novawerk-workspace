// /admin/partners, /admin/finance, /admin/subscribers, /admin/documents.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { documents, financeLedger, members, newsletterSubscribers, partners, type Database } from "@nw/db";

import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";
import { csvCell } from "../src/routes/admin/subscribers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

describe("/admin/partners", () => {
  it("creates, lists by name, moves through the pipeline and deletes", async () => {
    const { app } = makeApp(db);
    const created = await adminJson(
      app,
      "POST",
      "/admin/partners",
      { id: "acme-foundation", name: "Acme Foundation", primaryEmail: "Jane@Acme.org", primaryContact: "", owner: "ada" },
      201,
    );
    expect(created).toMatchObject({ id: "acme-foundation", stage: "intro", primaryContact: null, owner: "ada", lastTouchAt: null });
    await adminJson(app, "POST", "/admin/partners", { id: "beta-fund", name: "Beta Fund" }, 201);
    expect((await adminJson(app, "GET", "/admin/partners")).map((p: { id: string }) => p.id)).toEqual([
      "acme-foundation",
      "beta-fund",
    ]);

    const moved = await adminJson(app, "PATCH", "/admin/partners/acme-foundation", {
      stage: "grant-ask",
      lastTouchAt: "2026-10-01T09:00:00.000Z",
      owner: null,
    });
    expect(moved).toMatchObject({ stage: "grant-ask", owner: null, lastTouchAt: "2026-10-01T09:00:00.000Z" });

    expect(await adminJson(app, "DELETE", "/admin/partners/beta-fund")).toEqual({ ok: true });
    expect((await adminFetch(app, "DELETE", "/admin/partners/beta-fund")).status).toBe(404);
  });

  it("refuses a taken id, unknown owners, bad stages and id changes", async () => {
    const { app } = makeApp(db);
    await adminJson(app, "POST", "/admin/partners", { id: "acme", name: "Acme" }, 201);
    expect((await adminFetch(app, "POST", "/admin/partners", { id: "acme", name: "Other" })).status).toBe(409);
    const owner = await adminFetch(app, "POST", "/admin/partners", { id: "x-fund", name: "X", owner: "nobody" });
    expect(owner.status).toBe(400);
    expect(await owner.json()).toMatchObject({ issues: { owner: ["Unknown member"] } });
    expect((await adminFetch(app, "PATCH", "/admin/partners/acme", { stage: "won" })).status).toBe(400);
    expect((await adminFetch(app, "PATCH", "/admin/partners/acme", { id: "renamed" })).status).toBe(400);
    expect((await adminFetch(app, "PATCH", "/admin/partners/nobody", { stage: "closed" })).status).toBe(404);
  });
});

describe("/admin/finance", () => {
  it("adds entries in integer cents (euro), owned by the member, newest first", async () => {
    const { app } = makeApp(db);
    await db.insert(partners).values({ id: "acme", name: "Acme" });
    const [receipt] = await db
      .insert(documents)
      .values({ kind: "receipt", title: "Hosting receipt", r2Key: "receipts/1.pdf" })
      .returning();

    const grant = await adminJson(
      app,
      "POST",
      "/admin/finance",
      { entryDate: "2026-09-01", direction: "in", amountCents: 500_000, category: "grant", partnerId: "acme" },
      201,
    );
    expect(grant).toMatchObject({ amountCents: 500_000, currency: "EUR", owner: "ada", partnerId: "acme", description: null });
    await adminJson(
      app,
      "POST",
      "/admin/finance",
      { entryDate: "2026-10-02", direction: "out", amountCents: 1999, category: "hosting", receiptDocumentId: receipt!.id },
      201,
    );

    const list = await adminJson(app, "GET", "/admin/finance");
    expect(list.map((e: { amountCents: number }) => e.amountCents)).toEqual([1999, 500_000]);
  });

  it("refuses floats, negative amounts, other currencies and unknown links", async () => {
    const { app } = makeApp(db);
    const base = { entryDate: "2026-10-02", direction: "out", amountCents: 100 };
    expect((await adminFetch(app, "POST", "/admin/finance", { ...base, amountCents: 1.5 })).status).toBe(400);
    expect((await adminFetch(app, "POST", "/admin/finance", { ...base, amountCents: -100 })).status).toBe(400);
    expect((await adminFetch(app, "POST", "/admin/finance", { ...base, currency: "USD" })).status).toBe(400);
    const links = await adminFetch(app, "POST", "/admin/finance", { ...base, partnerId: "nobody", receiptDocumentId: 99 });
    expect(links.status).toBe(400);
    expect(await links.json()).toMatchObject({
      issues: { partnerId: ["Unknown partner"], receiptDocumentId: ["Unknown document"] },
    });
    expect(await db.select().from(financeLedger)).toEqual([]);
  });
});

describe("/admin/subscribers", () => {
  beforeEach(async () => {
    await db.insert(newsletterSubscribers).values([
      { email: "a@example.org", confirmedAt: new Date("2026-09-01T11:00:00Z"), createdAt: new Date("2026-09-01T10:00:00Z") },
      { email: "gone@example.org", subscribed: false, createdAt: new Date("2026-09-02T10:00:00Z") },
      {
        email: "=cmd@example.org",
        source: "event, Berlin",
        confirmedAt: new Date("2026-09-03T11:00:00Z"),
        createdAt: new Date("2026-09-03T10:00:00Z"),
      },
      { email: "pending@example.org", confirmTokenHash: "secret-hash", createdAt: new Date("2026-09-04T10:00:00Z") },
    ]);
  });

  it("lists everyone, newest first, with a status and no tokens", async () => {
    const list = await adminJson(makeApp(db).app, "GET", "/admin/subscribers");
    expect(list.map((s: { email: string; status: string }) => [s.email, s.status])).toEqual([
      ["pending@example.org", "pending"],
      ["=cmd@example.org", "confirmed"],
      ["gone@example.org", "unsubscribed"],
      ["a@example.org", "confirmed"],
    ]);
    expect(Object.keys(list[0]).sort()).toEqual(["confirmedAt", "createdAt", "email", "id", "source", "status"]);
  });

  it("exports the confirmed ones as CSV, safe for spreadsheets", async () => {
    const res = await adminFetch(makeApp(db).app, "GET", "/admin/subscribers/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="novawerk-subscribers-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(await res.text()).toBe(
      [
        "email,source,confirmed_at",
        "a@example.org,website,2026-09-01T11:00:00.000Z",
        `'=cmd@example.org,"event, Berlin",2026-09-03T11:00:00.000Z`,
        "",
      ].join("\r\n"),
    );
  });

  it("csvCell quotes and defuses", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1,2")).toBe(`"'-1,2"`);
  });
});

describe("/admin/documents", () => {
  it("shows your own documents and unowned ones, not other members'", async () => {
    await db.insert(documents).values([
      { kind: "contract", title: "Ada's contract", r2Key: "c/1.pdf", owner: "ada" },
      { kind: "nda", title: "Grace's NDA", r2Key: "c/2.pdf", owner: "grace" },
      { kind: "invoice", title: "Shared invoice", r2Key: "c/3.pdf" },
    ]);
    const list = await adminJson(makeApp(db).app, "GET", "/admin/documents");
    expect(list.map((d: { title: string }) => d.title).sort()).toEqual(["Ada's contract", "Shared invoice"]);
  });
});
