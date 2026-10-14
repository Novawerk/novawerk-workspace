// /admin/partners: the sponsor / partner pipeline. The narrative lives in records/partners/<id>.md;
// this is the structured part (stage, contact, owner, last touch).

import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { partnerInput, partnerUpdateInput } from "@nw/contracts";
import { partners } from "@nw/db";

import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { memberExists, textIdParam, type AdminDeps } from "./shared.js";

const toDate = (iso: string | null | undefined) => (iso === undefined ? undefined : iso === null ? null : new Date(iso));

export function partnerRoutes({ db }: AdminDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => c.json(await db.select().from(partners).orderBy(asc(partners.name)), 200))

    .post("/", zValidator("json", partnerInput, rejectInvalid), async (c) => {
      const { lastTouchAt, ...input } = c.req.valid("json");
      if (input.owner && !(await memberExists(db, input.owner))) {
        return c.json(validationFailed({ owner: ["Unknown member"] }), 400);
      }
      try {
        const [row] = await db
          .insert(partners)
          .values({ ...input, lastTouchAt: toDate(lastTouchAt) })
          .returning();
        return c.json(row!, 201);
      } catch (err) {
        if (isUniqueViolation(err)) return c.json(conflict("id", "Another partner already has this id"), 409);
        throw err;
      }
    })

    .patch(
      "/:id",
      zValidator("param", textIdParam, notFoundIfInvalid),
      zValidator("json", partnerUpdateInput, rejectInvalid),
      async (c) => {
        const { lastTouchAt, ...patch } = c.req.valid("json");
        if (patch.owner && !(await memberExists(db, patch.owner))) {
          return c.json(validationFailed({ owner: ["Unknown member"] }), 400);
        }
        const [row] = await db
          .update(partners)
          .set({ ...patch, lastTouchAt: toDate(lastTouchAt) })
          .where(eq(partners.id, c.req.valid("param").id))
          .returning();
        return row ? c.json(row, 200) : c.json(notFound, 404);
      },
    )

    .delete("/:id", zValidator("param", textIdParam, notFoundIfInvalid), async (c) => {
      // Ledger entries keep their amounts and lose the link (on delete set null).
      const [row] = await db.delete(partners).where(eq(partners.id, c.req.valid("param").id)).returning({ id: partners.id });
      return row ? c.json({ ok: true as const }, 200) : c.json(notFound, 404);
    });
}
