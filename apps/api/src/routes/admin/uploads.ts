// /admin/uploads: tickets for project pictures. The browser uploads straight to the public
// Blob store with the token; the file never passes through this function.

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { MAX_IMAGE_BYTES, imageUploadInput } from "@nw/contracts";
import { safeFilename } from "@nw/object-store";

import { rejectInvalid } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

export const FILES_OFF = {
  public: "Image uploads are off on this server: BLOB_PUBLIC_READ_WRITE_TOKEN is not set. Paste an image link instead.",
  private: "Document uploads are off on this server: BLOB_PRIVATE_READ_WRITE_TOKEN is not set.",
} as const;

export function uploadRoutes({ files }: AdminDeps) {
  return new Hono<ApiEnv>().post("/image", zValidator("json", imageUploadInput, rejectInvalid), async (c) => {
    if (!files?.ready.public) return c.json({ error: FILES_OFF.public }, 503);
    const { filename, contentType } = c.req.valid("json");
    const ticket = await files.uploadTicket("public", {
      pathname: `projects/${randomUUID()}-${safeFilename(filename)}`,
      contentTypes: [contentType],
      maxBytes: MAX_IMAGE_BYTES,
    });
    return c.json(ticket, 200);
  });
}
