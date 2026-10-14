// Guards the outbox gate. This is the security boundary for every email that leaves Novawerk:
// agents may only queue; nothing reaches Resend unless a member approved that exact row; and a
// row is sent at most once, even when two senders race.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, outbox, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import { approveEmail, emailsAbout, OutboxError, queueEmail, rejectEmail, sendApproved } from "./outbox.js";

// Mock Resend: every test controls what the provider answers and counts the calls.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const SEND_OPTS = { resendApiKey: "re_test", from: "Novawerk <info@novawerk.io>" };
const DRAFT = {
  to: "ada@example.org",
  subject: "We got your idea",
  body: "Hi Ada,\n\nThanks.\n\nNovawerk",
  draftedBy: "intake",
  relatedTable: "project_submissions",
  relatedId: "11111111-1111-1111-1111-111111111111",
};

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

beforeEach(async () => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "re_msg_1" }, error: null });
  await resetDb(db);
  await db.insert(members).values([
    { id: "haodong", displayName: "Haodong", email: "haodong@novawerk.io" },
    { id: "gone", displayName: "Gone", email: "gone@novawerk.io", active: false },
  ]);
});

async function row(id: string) {
  const [r] = await db.select().from(outbox).where(eq(outbox.id, id));
  return r!;
}

/** Approve the way the task spec describes: a member's action updates the row. */
async function approveInDb(id: string) {
  await db
    .update(outbox)
    .set({ status: "approved", approvedBy: "haodong", approvedAt: new Date() })
    .where(eq(outbox.id, id));
}

async function refusalCode(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(OutboxError);
  return (err as OutboxError).code;
}

describe("queueEmail", () => {
  it("inserts a pending row and sends nothing", async () => {
    const id = await queueEmail(db, DRAFT);
    expect(await row(id)).toMatchObject({
      status: "pending",
      to: "ada@example.org",
      draftedBy: "intake",
      relatedTable: "project_submissions",
      relatedId: DRAFT.relatedId,
      sentAt: null,
      approvedBy: null,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects anything that is not one plain address", async () => {
    for (const to of ["", "not-an-email", "a@b.org, c@d.org", "Ada <ada@example.org>", "a@b"]) {
      expect(await refusalCode(queueEmail(db, { ...DRAFT, to }))).toBe("invalid");
    }
  });

  it("rejects a multi-line subject (header injection) and an empty body", async () => {
    expect(await refusalCode(queueEmail(db, { ...DRAFT, subject: "Hi\r\nBcc: x@y.org" }))).toBe("invalid");
    expect(await refusalCode(queueEmail(db, { ...DRAFT, body: "  " }))).toBe("invalid");
  });

  it("emailsAbout finds rows by the record they are about", async () => {
    const id = await queueEmail(db, DRAFT);
    await queueEmail(db, { ...DRAFT, relatedId: "other" });
    expect((await emailsAbout(db, "project_submissions", DRAFT.relatedId)).map((r) => r.id)).toEqual([id]);
  });
});

describe("sendApproved — the gate", () => {
  it("queue → refused while pending → approve → sends once → second send refused", async () => {
    const id = await queueEmail(db, DRAFT);

    // Pending: refused, and Resend is never touched.
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("not_approved");
    expect(sendMock).not.toHaveBeenCalled();
    expect((await row(id)).status).toBe("pending");

    // A member approves.
    await approveInDb(id);

    // Sends exactly what was approved, from the configured sender.
    const result = await sendApproved(db, id, SEND_OPTS);
    expect(result).toMatchObject({ status: "sent", providerMessageId: "re_msg_1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0]).toEqual({
      from: "Novawerk <info@novawerk.io>",
      to: "ada@example.org",
      subject: "We got your idea",
      text: DRAFT.body,
    });
    expect(sendMock.mock.calls[0]![1]).toMatchObject({ idempotencyKey: expect.stringContaining(id) });
    const sent = await row(id);
    expect(sent).toMatchObject({ status: "sent", providerMessageId: "re_msg_1", error: null });
    expect(sent.sentAt).toBeInstanceOf(Date);

    // Second send: refused, no second call to Resend.
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("already_sent");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("two senders racing on the same approved row send it once", async () => {
    const id = await queueEmail(db, DRAFT);
    await approveInDb(id);
    const results = await Promise.allSettled([sendApproved(db, id, SEND_OPTS), sendApproved(db, id, SEND_OPTS)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a row flipped to approved without a member behind it", async () => {
    const id = await queueEmail(db, DRAFT);
    await db.update(outbox).set({ status: "approved" }).where(eq(outbox.id, id));
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("not_approved");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses rejected and unknown rows", async () => {
    const id = await queueEmail(db, DRAFT);
    await rejectEmail(db, id, "haodong");
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("not_approved");
    expect(await refusalCode(sendApproved(db, "00000000-0000-0000-0000-000000000000", SEND_OPTS))).toBe("not_found");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("never resends a row whose send was interrupted after the claim", async () => {
    const id = await queueEmail(db, DRAFT);
    await approveInDb(id);
    // Simulate a crash between the claim and Resend's answer: approved + sent_at set.
    await db.update(outbox).set({ sentAt: new Date() }).where(eq(outbox.id, id));
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("already_sent");
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("sendApproved — failure path", () => {
  it("marks the row failed with the provider error; a re-approval retries", async () => {
    const id = await queueEmail(db, DRAFT);
    await approveInDb(id);
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "domain not verified", name: "validation_error" } });

    const result = await sendApproved(db, id, SEND_OPTS);
    expect(result).toEqual({ status: "failed", error: "domain not verified" });
    expect(await row(id)).toMatchObject({ status: "failed", error: "domain not verified", sentAt: null });

    // Failed is not approved: no automatic retry.
    expect(await refusalCode(sendApproved(db, id, SEND_OPTS))).toBe("not_approved");

    // A member approves again; the retry goes out with a fresh idempotency key.
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct approval timestamp
    await approveEmail(db, id, "haodong");
    expect(await sendApproved(db, id, SEND_OPTS)).toMatchObject({ status: "sent" });
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1]![1].idempotencyKey).not.toBe(sendMock.mock.calls[0]![1].idempotencyKey);
  });

  it("marks the row failed when Resend throws (network)", async () => {
    const id = await queueEmail(db, DRAFT);
    await approveInDb(id);
    sendMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendApproved(db, id, SEND_OPTS)).toEqual({ status: "failed", error: "ECONNRESET" });
    expect((await row(id)).status).toBe("failed");
  });
});

describe("approveEmail / rejectEmail", () => {
  it("approve records who and when", async () => {
    const id = await queueEmail(db, DRAFT);
    const approved = await approveEmail(db, id, "haodong");
    expect(approved).toMatchObject({ status: "approved", approvedBy: "haodong" });
    expect(approved.approvedAt).toBeInstanceOf(Date);
  });

  it("only an active member can approve", async () => {
    const id = await queueEmail(db, DRAFT);
    expect(await refusalCode(approveEmail(db, id, "gone"))).toBe("member_inactive");
    expect(await refusalCode(approveEmail(db, id, "nobody"))).toBe("member_inactive");
    expect((await row(id)).status).toBe("pending");
  });

  it("cannot approve or reject a sent email", async () => {
    const id = await queueEmail(db, DRAFT);
    await approveEmail(db, id, "haodong");
    await sendApproved(db, id, SEND_OPTS);
    expect(await refusalCode(approveEmail(db, id, "haodong"))).toBe("not_pending");
    expect(await refusalCode(rejectEmail(db, id, "haodong"))).toBe("not_pending");
  });

  it("a rejected email cannot be approved again", async () => {
    const id = await queueEmail(db, DRAFT);
    await rejectEmail(db, id, "haodong");
    expect(await refusalCode(approveEmail(db, id, "haodong"))).toBe("not_pending");
  });
});
