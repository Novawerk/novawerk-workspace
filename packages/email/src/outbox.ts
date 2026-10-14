// The outbox: every email to someone outside Novawerk goes through here.
//
//   queueEmail()   — agents call this. Inserts a `pending` row. Never sends.
//   approveEmail() — a member approves in the admin panel (pending|failed → approved).
//   rejectEmail()  — a member rejects (nothing is ever sent for that row).
//   sendApproved() — the ONLY function that talks to Resend for outside mail. It loads the
//                    row and refuses unless a member approved it and it was never sent.
//
// Double sends are impossible: before calling Resend, sendApproved() claims the row with a
// conditional update (`status = 'approved' AND sent_at IS NULL`). Two concurrent callers race
// on that update; Postgres lets exactly one win. The loser is refused. If the process dies
// after the claim, the row stays claimed (approved + sent_at set, no provider id) and is never
// sent again automatically — we prefer "maybe not sent" over "sent twice".
//
// Agents never receive RESEND_API_KEY in their GitHub Actions env, so even a buggy agent that
// called sendApproved() could not reach Resend. The guarantee is in code and in config.

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Resend } from "resend";

import { members, outbox, type Database, type OutboxEmail } from "@nw/db";

export type { OutboxEmail };

export type OutboxErrorCode =
  | "invalid"
  | "not_found"
  | "not_approved"
  | "already_sent"
  | "not_pending"
  | "member_inactive";

export class OutboxError extends Error {
  constructor(
    readonly code: OutboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutboxError";
  }
}

export interface QueueEmailInput {
  to: string;
  subject: string;
  /** Plain text. */
  body: string;
  /** Agent id that drafted it, e.g. `intake` or `sponsor-outreach`. */
  draftedBy: string;
  /** What it is about, e.g. `project_submissions` + the row id. */
  relatedTable?: string;
  relatedId?: string;
}

// One plain address, no display name, no lists. Deliberately strict.
const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;

/** Queue an email for a member to approve. Returns the outbox id. Never sends anything. */
export async function queueEmail(db: Database, input: QueueEmailInput): Promise<string> {
  const to = input.to.trim();
  const subject = input.subject.trim();
  const draftedBy = input.draftedBy.trim();
  if (!SINGLE_ADDRESS.test(to)) {
    throw new OutboxError("invalid", `queueEmail(): "${input.to}" is not a single email address.`);
  }
  if (!subject || /[\r\n]/.test(subject)) {
    throw new OutboxError("invalid", "queueEmail(): subject must be one non-empty line.");
  }
  if (!input.body.trim()) throw new OutboxError("invalid", "queueEmail(): body is empty.");
  if (!draftedBy) throw new OutboxError("invalid", "queueEmail(): draftedBy is required.");

  const [row] = await db
    .insert(outbox)
    .values({
      to,
      subject,
      body: input.body,
      draftedBy,
      relatedTable: input.relatedTable ?? null,
      relatedId: input.relatedId ?? null,
      status: "pending",
    })
    .returning({ id: outbox.id });
  return row!.id;
}

/** Every outbox row about one record (any status), oldest first. Used to avoid duplicates. */
export async function emailsAbout(db: Database, relatedTable: string, relatedId: string): Promise<OutboxEmail[]> {
  return db
    .select()
    .from(outbox)
    .where(and(eq(outbox.relatedTable, relatedTable), eq(outbox.relatedId, relatedId)))
    .orderBy(outbox.createdAt);
}

/**
 * A member approves a queued (or previously failed) email. The member must exist and be
 * active. Authorisation — who may approve — is the caller's job (the API checks the session).
 */
export async function approveEmail(db: Database, outboxId: string, memberId: string): Promise<OutboxEmail> {
  const [member] = await db.select({ active: members.active }).from(members).where(eq(members.id, memberId)).limit(1);
  if (!member?.active) {
    throw new OutboxError("member_inactive", `approveEmail(): "${memberId}" is not an active member.`);
  }
  const [row] = await db
    .update(outbox)
    .set({ status: "approved", approvedBy: memberId, approvedAt: new Date(), error: null })
    .where(and(eq(outbox.id, outboxId), inArray(outbox.status, ["pending", "failed"]), isNull(outbox.sentAt)))
    .returning();
  if (!row) throw await refusal(db, outboxId, "approveEmail(): only a pending or failed email can be approved.");
  return row;
}

/** A member rejects an email. Works until the send starts; a rejected row is never sent. */
export async function rejectEmail(db: Database, outboxId: string, memberId: string): Promise<OutboxEmail> {
  const [row] = await db
    .update(outbox)
    .set({ status: "rejected", approvedBy: memberId, approvedAt: new Date() })
    .where(
      and(eq(outbox.id, outboxId), inArray(outbox.status, ["pending", "approved", "failed"]), isNull(outbox.sentAt)),
    )
    .returning();
  if (!row) throw await refusal(db, outboxId, "rejectEmail(): this email is already sent, sending, or rejected.");
  return row;
}

export interface SendOptions {
  resendApiKey: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
}

export type SendResult =
  | { status: "sent"; providerMessageId: string; sentAt: Date }
  | { status: "failed"; error: string };

/**
 * Send one approved outbox row through Resend, exactly once.
 *
 * Throws OutboxError (and sends nothing) unless the row exists, a member approved it, and it
 * has never been sent or claimed. A provider error marks the row `failed` with the error and
 * returns `{ status: "failed" }`; a member can approve it again to retry.
 */
export async function sendApproved(db: Database, outboxId: string, opts: SendOptions): Promise<SendResult> {
  const [current] = await db.select().from(outbox).where(eq(outbox.id, outboxId)).limit(1);
  if (!current) throw new OutboxError("not_found", `sendApproved(): no outbox row ${outboxId}.`);
  if (current.status === "sent" || current.sentAt) {
    throw new OutboxError("already_sent", `sendApproved(): outbox row ${outboxId} was already sent (or is sending).`);
  }
  if (current.status !== "approved" || !current.approvedBy || !current.approvedAt) {
    throw new OutboxError(
      "not_approved",
      `sendApproved(): outbox row ${outboxId} is "${current.status}". Only a member-approved email can be sent.`,
    );
  }

  // Claim: the conditional update only matches while the row is still approved and unclaimed.
  const [claimed] = await db
    .update(outbox)
    .set({ sentAt: new Date() })
    .where(
      and(
        eq(outbox.id, outboxId),
        eq(outbox.status, "approved"),
        isNull(outbox.sentAt),
        isNotNull(outbox.approvedBy),
        isNotNull(outbox.approvedAt),
      ),
    )
    .returning();
  if (!claimed) {
    throw new OutboxError("already_sent", `sendApproved(): outbox row ${outboxId} changed underneath us; not sending.`);
  }

  let providerMessageId: string;
  try {
    const resend = new Resend(opts.resendApiKey);
    const { data, error } = await resend.emails.send(
      { from: opts.from, to: claimed.to, subject: claimed.subject, text: claimed.body },
      // One key per approval: a retry inside this call is deduplicated by Resend, while a
      // member's re-approval after a failure gets a fresh key and really retries.
      { idempotencyKey: `outbox-${claimed.id}-${claimed.approvedAt!.getTime()}` },
    );
    if (error || !data?.id) throw new Error(error?.message ?? "Resend returned no message id");
    providerMessageId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(outbox).set({ status: "failed", error: message, sentAt: null }).where(eq(outbox.id, outboxId));
    return { status: "failed", error: message };
  }

  const sentAt = new Date();
  await db
    .update(outbox)
    .set({ status: "sent", sentAt, providerMessageId, error: null })
    .where(eq(outbox.id, outboxId));
  return { status: "sent", providerMessageId, sentAt };
}

/** Build the most useful error after a conditional update matched nothing. */
async function refusal(db: Database, outboxId: string, message: string): Promise<OutboxError> {
  const [row] = await db.select({ status: outbox.status }).from(outbox).where(eq(outbox.id, outboxId)).limit(1);
  if (!row) return new OutboxError("not_found", `no outbox row ${outboxId}.`);
  return new OutboxError("not_pending", `${message} (status: ${row.status})`);
}
