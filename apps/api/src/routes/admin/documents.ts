// /admin/documents: the index of private files (contracts, NDAs, invoices, receipts) and the
// files themselves, in the private Blob store.
//
//   GET    /documents              yours, plus the ones that belong to Novawerk as a whole
//   POST   /documents/upload       a ticket to upload one file under your own prefix
//   POST   /documents              record an uploaded file
//   GET    /documents/:id/file     stream the file (same visibility as the list)
//   DELETE /documents/:id          yours, or Novawerk's; the ledger keeps its rows
//
// Admins only (src/routes/admin.ts). Each admin sees their own documents. Rows without an owner
// belong to Novawerk as a whole and show for every admin. A member can only record files under
// their own prefix (`<id>/…`). Project files are documents too, but live under their project
// (./project-files.ts) and don't show here.

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";

import { MAX_DOCUMENT_BYTES, documentCreateInput, documentUploadInput } from "@nw/contracts";
import { documents, type Database } from "@nw/db";
import { assertMemberPrefix, memberKey, safeFilename } from "@nw/object-store";

import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { privateFileResponse } from "./private-file.js";
import { intIdParam, type AdminDeps } from "./shared.js";
import { FILES_OFF } from "./uploads.js";

const visibleTo = (memberId: string) =>
  and(or(eq(documents.owner, memberId), isNull(documents.owner)), isNull(documents.projectId));

async function visibleDocument(db: Database, id: number, memberId: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), visibleTo(memberId)))
    .limit(1);
  return row;
}

export function documentRoutes({ db, files, logger }: AdminDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const rows = await db
        .select()
        .from(documents)
        .where(visibleTo(c.get("member").id))
        .orderBy(desc(documents.createdAt));
      return c.json(rows, 200);
    })

    .post("/upload", zValidator("json", documentUploadInput, rejectInvalid), async (c) => {
      if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
      const { filename, contentType } = c.req.valid("json");
      const ticket = await files.uploadTicket("private", {
        pathname: memberKey(c.get("member").id, `${randomUUID()}-${safeFilename(filename)}`),
        contentTypes: [contentType],
        maxBytes: MAX_DOCUMENT_BYTES,
      });
      return c.json(ticket, 200);
    })

    .post("/", zValidator("json", documentCreateInput, rejectInvalid), async (c) => {
      if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
      const me = c.get("member").id;
      const { pathname, kind, title, counterparty, signedOn } = c.req.valid("json");
      try {
        assertMemberPrefix(me, pathname);
      } catch {
        return c.json(validationFailed({ pathname: ["That upload isn't yours"] }), 400);
      }
      if (!(await files.statPrivate(pathname))) {
        return c.json(validationFailed({ pathname: ["We can't find the uploaded file. Upload it again."] }), 400);
      }
      try {
        const [row] = await db
          .insert(documents)
          .values({ kind, title, r2Key: pathname, owner: me, counterparty: counterparty ?? null, signedOn: signedOn ?? null })
          .returning();
        return c.json(row!, 201);
      } catch (err) {
        if (isUniqueViolation(err)) return c.json(conflict("pathname", "This file is already recorded"), 409);
        throw err;
      }
    })

    .get("/:id/file", zValidator("param", intIdParam, notFoundIfInvalid), async (c) => {
      const row = await visibleDocument(db, c.req.valid("param").id, c.get("member").id);
      if (!row) return c.json(notFound, 404);
      if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
      const file = await files.openPrivate(row.r2Key);
      if (!file) return c.json({ error: "The file is missing from storage" }, 404);
      return privateFileResponse(c, file, row.title);
    })

    .delete("/:id", zValidator("param", intIdParam, notFoundIfInvalid), async (c) => {
      const [row] = await db
        .delete(documents)
        .where(and(eq(documents.id, c.req.valid("param").id), visibleTo(c.get("member").id)))
        .returning();
      if (!row) return c.json(notFound, 404);
      // The row is gone (ledger entries lose their receipt link); the file goes best effort.
      if (files?.ready.private) {
        await files.deletePrivate(row.r2Key).catch((err) => logger.warn("[api] could not delete a document file:", err));
      }
      return c.json({ ok: true as const }, 200);
    });
}
