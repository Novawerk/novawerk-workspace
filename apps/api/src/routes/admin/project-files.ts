// /admin/projects/:id/files — a project's own files (designs, decks, notes, screenshots) in the
// private Blob store. The project guard (./access.ts) already limits these routes to admins and
// the project's team.
//
//   GET    /projects/:id/files                  the files, newest first, with who added them
//   POST   /projects/:id/files/upload           a ticket to upload one file under your prefix
//   POST   /projects/:id/files                  record an uploaded file
//   GET    /projects/:id/files/:fileId          open or download it
//   DELETE /projects/:id/files/:fileId          whoever added it, the Initiator, or an admin
//
// A file lives under its uploader's prefix (`<member>/projects/<project>/…`), like every private
// file, and its `documents` row links it to the project.

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { MAX_DOCUMENT_BYTES, projectFileCreateInput, projectFileUploadInput } from "@nw/contracts";
import { documents, members, type Database } from "@nw/db";
import { assertMemberPrefix, memberKey, safeFilename } from "@nw/object-store";

import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { canChangeTeam } from "./access.js";
import { privateFileResponse } from "./private-file.js";
import { uuidParam, type AdminDeps } from "./shared.js";
import { FILES_OFF } from "./uploads.js";

const fileParam = z.object({ id: z.guid(), fileId: z.coerce.number().int().positive() });

async function filesOf(db: Database, projectId: string, fileId?: number) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      owner: documents.owner,
      ownerName: members.displayName,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(members, eq(members.id, documents.owner))
    .where(and(eq(documents.projectId, projectId), fileId ? eq(documents.id, fileId) : undefined))
    .orderBy(desc(documents.createdAt));
}

async function fileRow(db: Database, projectId: string, fileId: number) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, fileId), eq(documents.projectId, projectId)))
    .limit(1);
  return row;
}

export function projectFileRoutes({ db, files, logger }: AdminDeps) {
  return new Hono<ApiEnv>()
    .get("/:id/files", zValidator("param", uuidParam, notFoundIfInvalid), async (c) =>
      c.json(await filesOf(db, c.req.valid("param").id), 200),
    )

    .post(
      "/:id/files/upload",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", projectFileUploadInput, rejectInvalid),
      async (c) => {
        if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
        const { id } = c.req.valid("param");
        const { filename, contentType } = c.req.valid("json");
        const ticket = await files.uploadTicket("private", {
          pathname: memberKey(c.get("member").id, `projects/${id}/${randomUUID()}-${safeFilename(filename)}`),
          contentTypes: [contentType],
          maxBytes: MAX_DOCUMENT_BYTES,
        });
        return c.json(ticket, 200);
      },
    )

    .post(
      "/:id/files",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", projectFileCreateInput, rejectInvalid),
      async (c) => {
        if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
        const { id } = c.req.valid("param");
        const { pathname, title } = c.req.valid("json");
        const me = c.get("member").id;
        try {
          assertMemberPrefix(me, pathname);
        } catch {
          return c.json(validationFailed({ pathname: ["That upload isn't yours"] }), 400);
        }
        if (!pathname.startsWith(`${me}/projects/${id}/`)) {
          return c.json(validationFailed({ pathname: ["That upload belongs to another project"] }), 400);
        }
        const stored = await files.statPrivate(pathname);
        if (!stored) return c.json(validationFailed({ pathname: ["We can't find the uploaded file. Upload it again."] }), 400);
        try {
          const [row] = await db
            .insert(documents)
            .values({
              kind: stored.contentType.startsWith("image/") ? "image" : "other",
              title,
              r2Key: pathname,
              owner: me,
              projectId: id,
            })
            .returning({ id: documents.id });
          return c.json((await filesOf(db, id, row!.id))[0]!, 201);
        } catch (err) {
          if (isUniqueViolation(err)) return c.json(conflict("pathname", "This file is already recorded"), 409);
          throw err;
        }
      },
    )

    .get("/:id/files/:fileId", zValidator("param", fileParam, notFoundIfInvalid), async (c) => {
      const { id, fileId } = c.req.valid("param");
      const row = await fileRow(db, id, fileId);
      if (!row) return c.json(notFound, 404);
      if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
      const file = await files.openPrivate(row.r2Key);
      if (!file) return c.json({ error: "The file is missing from storage" }, 404);
      return privateFileResponse(c, file, row.title);
    })

    .delete("/:id/files/:fileId", zValidator("param", fileParam, notFoundIfInvalid), async (c) => {
      const { id, fileId } = c.req.valid("param");
      const member = c.get("member");
      const row = await fileRow(db, id, fileId);
      if (!row) return c.json(notFound, 404);
      if (row.owner !== member.id && !(await canChangeTeam(db, member, id))) {
        return c.json({ error: "Only whoever added it, the Initiator or an admin can delete this file" }, 403);
      }
      await db.delete(documents).where(eq(documents.id, row.id));
      if (files?.ready.private) {
        await files.deletePrivate(row.r2Key).catch((err) => logger.warn("[api] could not delete a project file:", err));
      }
      return c.json({ ok: true as const }, 200);
    });
}
