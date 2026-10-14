// /admin/finance: the ledger. One row per money movement, integer cents, euro. Append-only on
// purpose: a mistake is fixed with a correcting entry, so the history stays honest.

import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { LEDGER_CURRENCY, financeEntryInput } from "@nw/contracts";
import { documents, financeLedger, partners } from "@nw/db";

import { rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

export function financeRoutes({ db }: AdminDeps) {
  return new Hono<ApiEnv>()
    /** Newest first. Small data; the panel sums and filters on its side. */
    .get("/", async (c) =>
      c.json(await db.select().from(financeLedger).orderBy(desc(financeLedger.entryDate), desc(financeLedger.id)), 200),
    )

    .post("/", zValidator("json", financeEntryInput, rejectInvalid), async (c) => {
      const input = c.req.valid("json");
      const issues: Record<string, string[]> = {};
      if (input.partnerId) {
        const [p] = await db.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId));
        if (!p) issues.partnerId = ["Unknown partner"];
      }
      if (input.receiptDocumentId) {
        const [d] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, input.receiptDocumentId));
        if (!d) issues.receiptDocumentId = ["Unknown document"];
      }
      if (Object.keys(issues).length) return c.json(validationFailed(issues), 400);

      const [row] = await db
        .insert(financeLedger)
        .values({ ...input, currency: LEDGER_CURRENCY, owner: c.get("member").id })
        .returning();
      return c.json(row!, 201);
    });
}
