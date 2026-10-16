// /admin/members: everyone in Novawerk, one account each (NB-ADR-0014). `role` maintainer runs
// this panel; there are no other ranks.
// Every member can list them (team and owner pickers), without their email addresses; only admins
// add or change members.

import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { memberCreateInput, memberUpdateInput } from "@nw/contracts";
import { isMaintainer, members } from "@nw/db";
import { TaskRuleError, claimMemberId } from "@nw/tasks";

import { linkInitiatorProjects } from "../../admin/accept.js";
import { tellChat } from "../../chat-sso.js";
import { requireAdmin } from "../../auth.js";
import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import { toMemberRow, type ApiEnv } from "../../types.js";
import { textIdParam, type AdminDeps } from "./shared.js";

export function memberRoutes({ db, env, logger }: AdminDeps) {
  return (
    new Hono<ApiEnv>()
      /** Active members first, then by name. Reviewer pickers filter to active ones. */
      .get("/", async (c) => {
        const rows = await db.select().from(members).orderBy(desc(members.active), asc(members.displayName));
        const admin = isMaintainer(c.get("member"));
        return c.json(rows.map((m) => (admin ? toMemberRow(m) : { ...toMemberRow(m), email: "" })), 200);
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
            // A member's id is a handle too: not a contributor's (one namespace, locked until we commit).
            await claimMemberId(tx, input.id, { exact: true, field: "id" }).catch((err: unknown) => {
              if (err instanceof TaskRuleError && err.code === "conflict") {
                throw new TaskRuleError("conflict", "Another member or contributor already has this handle", "id");
              }
              throw err;
            });
            const [row] = await tx
              .insert(members)
              .values({
                id: input.id,
                handle: input.id,
                displayName: input.displayName,
                email,
                role: input.role ?? "member",
                joinedOn: input.joinedOn ?? new Date().toISOString().slice(0, 10),
              })
              .returning();
            // Someone whose pitch we accepted becomes its Initiator now (see src/admin/accept.ts).
            const initiatorOf = await linkInitiatorProjects(tx, row!);
            return { ...toMemberRow(row!), initiatorOf };
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
            if (patch.role === "member") {
              return c.json(validationFailed({ role: ["You can't stop being a maintainer yourself"] }), 400);
            }
            if (patch.active === false) {
              return c.json(validationFailed({ active: ["You can't mark yourself inactive"] }), 400);
            }
          }
          const [before] = await db.select().from(members).where(eq(members.id, id)).limit(1);
          const [row] = await db.update(members).set(patch).where(eq(members.id, id)).returning();
          if (!before || !row) return c.json(notFound, 404);
          // The chat follows (NB-ADR-0014): out with the account, and the same role.
          if (before.active && !row.active) await tellChat(env.chatSso, logger, row, "closed");
          else if (before.role !== row.role) await tellChat(env.chatSso, logger, row, "role");
          return c.json(toMemberRow(row), 200);
        },
      )
  );
}
