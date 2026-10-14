// /admin/outbox: every email to someone outside Novawerk waits here for a member.
//
//   GET   /outbox?status=&relatedTable=&relatedId=   list, newest first
//   GET   /outbox/:id
//   POST  /outbox              a member's own draft ("Draft reply"), queued as pending
//   PATCH /outbox/:id          edit to / subject / body while pending
//   POST  /outbox/:id/approve  approveEmail() then sendApproved(). An `approved` row that was
//                              never sent (no Resend key at the time) is sent by the same call.
//   POST  /outbox/:id/reject   rejectEmail(); it can never be sent
//
// The gate itself lives in @nw/email. This router never sends anything sendApproved() refuses.

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { OUTBOX_RELATED_TABLES, OUTBOX_STATUSES, outboxDraftInput, outboxUpdateInput } from "@nw/contracts";
import { outbox, partners, type Database, type OutboxEmail } from "@nw/db";
import { OutboxError, approveEmail, queueEmail, rejectEmail, sendApproved } from "@nw/email";

import { notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { uuidParam, type AdminDeps } from "./shared.js";

const outboxFilter = z.object({
  status: z.enum(OUTBOX_STATUSES).optional(),
  relatedTable: z.enum(OUTBOX_RELATED_TABLES).optional(),
  relatedId: z.string().min(1).max(100).optional(),
});

/** OutboxError → HTTP. */
function refused(c: Context<ApiEnv>, err: unknown) {
  if (!(err instanceof OutboxError)) throw err;
  switch (err.code) {
    case "not_found":
      return c.json(notFound, 404);
    case "invalid":
      return c.json(validationFailed({ _form: [err.message] }), 400);
    case "member_inactive":
      return c.json({ error: "Only an active member can approve" }, 403);
    default:
      return c.json({ error: stateMessage(err.code) }, 409);
  }
}

function stateMessage(code: OutboxError["code"]): string {
  switch (code) {
    case "already_sent":
      return "This email was already sent, or a send is in progress";
    case "not_pending":
      return "Only a pending or failed email can be approved or rejected";
    default:
      return "This email can't be sent in its current state";
  }
}

async function getRow(db: Database, id: string): Promise<OutboxEmail | undefined> {
  const [row] = await db.select().from(outbox).where(eq(outbox.id, id)).limit(1);
  return row;
}

/** After a partner email goes out, the partner's "last touch" moves to now. */
async function touchPartner(db: Database, row: OutboxEmail, at: Date) {
  if (row.relatedTable !== "partners" || !row.relatedId) return;
  await db.update(partners).set({ lastTouchAt: at }).where(eq(partners.id, row.relatedId));
}

export function outboxRoutes({ db, outbox: sender }: AdminDeps) {
  return new Hono<ApiEnv>()
    .get("/", zValidator("query", outboxFilter, rejectInvalid), async (c) => {
      const { status, relatedTable, relatedId } = c.req.valid("query");
      const rows = await db
        .select()
        .from(outbox)
        .where(
          and(
            status ? eq(outbox.status, status) : undefined,
            relatedTable ? eq(outbox.relatedTable, relatedTable) : undefined,
            relatedId ? eq(outbox.relatedId, relatedId) : undefined,
          ),
        )
        .orderBy(desc(outbox.createdAt));
      return c.json(rows, 200);
    })

    .get("/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      const row = await getRow(db, c.req.valid("param").id);
      return row ? c.json(row, 200) : c.json(notFound, 404);
    })

    .post("/", zValidator("json", outboxDraftInput, rejectInvalid), async (c) => {
      const input = c.req.valid("json");
      try {
        const id = await queueEmail(db, { ...input, draftedBy: `admin:${c.get("member").id}` });
        return c.json((await getRow(db, id))!, 201);
      } catch (err) {
        return refused(c, err);
      }
    })

    .patch(
      "/:id",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", outboxUpdateInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const [row] = await db
          .update(outbox)
          .set(c.req.valid("json"))
          .where(and(eq(outbox.id, id), eq(outbox.status, "pending")))
          .returning();
        if (row) return c.json(row, 200);
        return (await getRow(db, id))
          ? c.json({ error: "Only a pending email can be edited" }, 409)
          : c.json(notFound, 404);
      },
    )

    .post("/:id/approve", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const current = await getRow(db, id);
      if (!current) return c.json(notFound, 404);

      if (current.status === "approved" && current.sentAt) {
        return c.json(
          { error: "A send of this email was interrupted. Check Resend before retrying (docs/runbook.md)." },
          409,
        );
      }

      let approved: OutboxEmail;
      try {
        // Approved earlier but never sent (no key then): keep that approval and just send.
        approved =
          current.status === "approved" && !current.sentAt ? current : await approveEmail(db, id, c.get("member").id);
      } catch (err) {
        return refused(c, err);
      }

      if (!sender?.resendApiKey) {
        return c.json(
          {
            email: approved,
            sent: false as const,
            note: "Approved, not sent: the API has no RESEND_API_KEY. Press Send once the key is set.",
          },
          200,
        );
      }

      try {
        const result = await sendApproved(db, id, { resendApiKey: sender.resendApiKey, from: sender.from });
        const email = (await getRow(db, id))!;
        if (result.status === "sent") {
          await touchPartner(db, email, result.sentAt);
          return c.json({ email, sent: true as const }, 200);
        }
        return c.json({ email, sent: false as const, note: `Resend refused it: ${result.error}` }, 200);
      } catch (err) {
        return refused(c, err);
      }
    })

    .post("/:id/reject", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      try {
        return c.json(await rejectEmail(db, c.req.valid("param").id, c.get("member").id), 200);
      } catch (err) {
        return refused(c, err);
      }
    });
}
