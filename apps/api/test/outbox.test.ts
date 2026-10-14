// /admin/outbox: members draft, edit, approve (→ send) and reject. Resend is mocked; every test
// checks that nothing reaches it unless a member approved that exact row.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, outbox, partners, type Database } from "@nw/db";
import { queueEmail } from "@nw/email";

import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const SENDER = { from: "Novawerk <info@novawerk.io>", resendApiKey: "re_test" };
const DRAFT = {
  to: "ada@example.org",
  subject: "We got your idea",
  body: "Hi Ada,\n\nThanks.\n\nNovawerk",
  draftedBy: "intake",
};

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "re_msg_1" }, error: null });
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

async function row(id: string) {
  const [r] = await db.select().from(outbox).where(eq(outbox.id, id));
  return r!;
}

describe("GET /admin/outbox", () => {
  it("lists newest first and filters by status and related record", async () => {
    const { app } = makeApp(db);
    const a = await queueEmail(db, { ...DRAFT, relatedTable: "partners", relatedId: "acme" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await queueEmail(db, { ...DRAFT, subject: "Second" });
    await db.update(outbox).set({ status: "rejected" }).where(eq(outbox.id, b));

    expect((await adminJson(app, "GET", "/admin/outbox")).map((r: { id: string }) => r.id)).toEqual([b, a]);
    expect((await adminJson(app, "GET", "/admin/outbox?status=pending")).map((r: { id: string }) => r.id)).toEqual([a]);
    const about = await adminJson(app, "GET", "/admin/outbox?relatedTable=partners&relatedId=acme");
    expect(about.map((r: { id: string }) => r.id)).toEqual([a]);
    expect((await adminFetch(app, "GET", "/admin/outbox?status=bogus")).status).toBe(400);
    expect((await adminJson(app, "GET", `/admin/outbox/${a}`)).subject).toBe("We got your idea");
    expect((await adminFetch(app, "GET", "/admin/outbox/00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});

describe("POST /admin/outbox (Draft reply)", () => {
  it("queues a pending row drafted by the member and sends nothing", async () => {
    const { app } = makeApp(db, { outbox: SENDER });
    const created = await adminJson(
      app,
      "POST",
      "/admin/outbox",
      {
        to: "lena@example.org",
        subject: "Your Novawerk pitch",
        body: "Hi Lena",
        relatedTable: "project_submissions",
        relatedId: "11111111-1111-1111-1111-111111111111",
      },
      201,
    );
    expect(created).toMatchObject({
      status: "pending",
      draftedBy: "admin:ada",
      relatedTable: "project_submissions",
      approvedBy: null,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("validates the address, subject and body", async () => {
    const { app } = makeApp(db);
    const res = await adminFetch(app, "POST", "/admin/outbox", { to: "Lena <lena@example.org>", subject: "Hi", body: "x" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: object }).issues).toHaveProperty("to");
    expect((await adminFetch(app, "POST", "/admin/outbox", { to: "a@b.org", subject: "a\nb", body: "x" })).status).toBe(400);
  });
});

describe("PATCH /admin/outbox/:id", () => {
  it("edits a pending email, and only a pending one", async () => {
    const { app } = makeApp(db);
    const id = await queueEmail(db, DRAFT);
    const edited = await adminJson(app, "PATCH", `/admin/outbox/${id}`, { subject: "Thanks for your pitch", to: "ada@example.com" });
    expect(edited).toMatchObject({ subject: "Thanks for your pitch", to: "ada@example.com", status: "pending" });

    await adminJson(app, "POST", `/admin/outbox/${id}/reject`);
    const late = await adminFetch(app, "PATCH", `/admin/outbox/${id}`, { body: "changed" });
    expect(late.status).toBe(409);
    expect((await row(id)).body).toBe(DRAFT.body);
    expect((await adminFetch(app, "PATCH", "/admin/outbox/00000000-0000-0000-0000-000000000000", { body: "x" })).status).toBe(404);
  });
});

describe("POST /admin/outbox/:id/approve", () => {
  it("approves and sends exactly the edited row, once", async () => {
    const { app } = makeApp(db, { outbox: SENDER });
    const id = await queueEmail(db, DRAFT);
    await adminJson(app, "PATCH", `/admin/outbox/${id}`, { body: "Hi Ada, edited." });

    const result = await adminJson(app, "POST", `/admin/outbox/${id}/approve`);
    expect(result).toMatchObject({
      sent: true,
      email: { status: "sent", approvedBy: "ada", providerMessageId: "re_msg_1" },
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0]).toEqual({
      from: SENDER.from,
      to: DRAFT.to,
      subject: DRAFT.subject,
      text: "Hi Ada, edited.",
    });

    const again = await adminFetch(app, "POST", `/admin/outbox/${id}/approve`);
    expect(again.status).toBe(409);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("without a Resend key: approves, does not send, and explains; Send later goes out", async () => {
    const id = await queueEmail(db, DRAFT);
    const noKey = makeApp(db, { outbox: { from: SENDER.from } }).app;
    const result = await adminJson(noKey, "POST", `/admin/outbox/${id}/approve`);
    expect(result).toMatchObject({ sent: false, email: { status: "approved", approvedBy: "ada", sentAt: null } });
    expect(result.note).toMatch(/RESEND_API_KEY/);
    expect(sendMock).not.toHaveBeenCalled();

    // Once the key is there, the same button sends the approved row (approval by ada stands).
    const withKey = makeApp(db, { outbox: SENDER }).app;
    const sent = await adminJson(withKey, "POST", `/admin/outbox/${id}/approve`);
    expect(sent).toMatchObject({ sent: true, email: { status: "sent", approvedBy: "ada" } });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("marks a provider failure as failed with the error; approving again retries", async () => {
    const { app } = makeApp(db, { outbox: SENDER });
    const id = await queueEmail(db, DRAFT);
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "domain not verified", name: "validation_error" } });
    const failed = await adminJson(app, "POST", `/admin/outbox/${id}/approve`);
    expect(failed).toMatchObject({ sent: false, email: { status: "failed", error: "domain not verified" } });
    expect(failed.note).toContain("domain not verified");

    const retried = await adminJson(app, "POST", `/admin/outbox/${id}/approve`);
    expect(retried).toMatchObject({ sent: true, email: { status: "sent" } });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("refuses rejected rows and interrupted sends; 404 for unknown rows", async () => {
    const { app } = makeApp(db, { outbox: SENDER });
    const rejected = await queueEmail(db, DRAFT);
    await adminJson(app, "POST", `/admin/outbox/${rejected}/reject`);
    expect((await adminFetch(app, "POST", `/admin/outbox/${rejected}/approve`)).status).toBe(409);

    const interrupted = await queueEmail(db, DRAFT);
    await db
      .update(outbox)
      .set({ status: "approved", approvedBy: "ada", approvedAt: new Date(), sentAt: new Date() })
      .where(eq(outbox.id, interrupted));
    const res = await adminFetch(app, "POST", `/admin/outbox/${interrupted}/approve`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/interrupted/);

    expect((await adminFetch(app, "POST", "/admin/outbox/00000000-0000-0000-0000-000000000000/approve")).status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("moves a partner's last touch when their email goes out", async () => {
    await db.insert(partners).values({ id: "acme", name: "Acme Foundation" });
    const id = await queueEmail(db, { ...DRAFT, relatedTable: "partners", relatedId: "acme" });
    await adminJson(makeApp(db, { outbox: SENDER }).app, "POST", `/admin/outbox/${id}/approve`);
    const [partner] = await db.select().from(partners).where(eq(partners.id, "acme"));
    expect(partner!.lastTouchAt).toBeInstanceOf(Date);
  });
});

describe("POST /admin/outbox/:id/reject", () => {
  it("rejects; the row can never be sent", async () => {
    const { app } = makeApp(db, { outbox: SENDER });
    const id = await queueEmail(db, DRAFT);
    expect(await adminJson(app, "POST", `/admin/outbox/${id}/reject`)).toMatchObject({ status: "rejected", approvedBy: "ada" });
    expect((await adminFetch(app, "POST", `/admin/outbox/${id}/reject`)).status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
