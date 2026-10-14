// /admin/members: everyone in Novawerk. No tiers; `canAdmin` is a permission to run this panel.
// Every member can list them (team and owner pickers), without their email addresses; only admins
// add or change members.

import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { memberCreateInput, memberUpdateInput } from "@nw/contracts";
import { members } from "@nw/db";

import { linkInitiatorProjects } from "../../admin/accept.js";
import { requireAdmin } from "../../auth.js";
import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { textIdParam, type AdminDeps } from "./shared.js";

export function memberRoutes({ db }: AdminDeps) {
  return (
    new Hono<ApiEnv>()
      /** Active members first, then by name. Reviewer pickers filter to active ones. */
      .get("/", async (c) => {
        const rows = await db.select().from(members).orderBy(desc(members.active), asc(members.displayName));
        const admin = c.get("member").canAdmin;
        return c.json(admin ? rows : rows.map((m) => ({ ...m, email: "" })), 200);
      })

      .post("/", requireAdmin, zValidator("json", memberCreateInput, rejectInvalid), async (c) => {
        const input = c.req.valid("json");
        const email = input.email.toLowerCase();
        // Sign-in matches email case-insensitively, so uniqueness must too (the column is case-sensitive).
        const [sameEmail] = await db
          .select({ id: members.id })
          .from(members)
          .where(sql`lower(${members.email}) = ${email}`)
          .limit(1);
        if (sameEmail) return c.json(conflict("email", `${sameEmail.id} already uses this email`), 409);
        try {
          const member = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(members)
              .values({
                id: input.id,
                displayName: input.displayName,
                email,
                canAdmin: input.canAdmin ?? false,
                joinedOn: input.joinedOn ?? new Date().toISOString().slice(0, 10),
              })
              .returning();
            // Someone whose pitch we accepted becomes its Initiator now (see src/admin/accept.ts).
            const initiatorOf = await linkInitiatorProjects(tx, row!);
            return { ...row!, initiatorOf };
          });
          return c.json(member, 201);
        } catch (err) {
          if (isUniqueViolation(err)) return c.json(conflict("id", "Another member already has this handle"), 409);
          throw err;
        }
      })

      .patch(
        "/:id",
        requireAdmin,
        zValidator("param", textIdParam, notFoundIfInvalid),
        zValidator("json", memberUpdateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const patch = c.req.valid("json");
          // Nobody locks themselves out. This also keeps at least one active admin around.
          if (id === c.get("member").id) {
            if (patch.canAdmin === false) {
              return c.json(validationFailed({ canAdmin: ["You can't remove your own admin access"] }), 400);
            }
            if (patch.active === false) {
              return c.json(validationFailed({ active: ["You can't mark yourself inactive"] }), 400);
            }
          }
          const [row] = await db.update(members).set(patch).where(eq(members.id, id)).returning();
          return row ? c.json(row, 200) : c.json(notFound, 404);
        },
      )
  );
}
