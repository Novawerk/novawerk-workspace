// "Continue in the repo": a post as the folder `pnpm post pull` writes (posts/README.md).
//
// A member asks the admin panel for a link (POST /admin/posts/:id/export-link); the link is good
// for 30 minutes and for that one post, signed with the session key, so the terminal needs no
// sign-in and no database access. GET /exports/posts/:id answers with the folder's text files
// and the pictures to fetch.

import { createHmac, timingSafeEqual } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { exportFolder, postForExport } from "@nw/promo/repo";

import { notFound } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

const TTL_MS = 30 * 60_000;

const sign = (secret: string, id: string, expires: number) =>
  createHmac("sha256", secret).update(`post-export:${id}:${expires}`).digest("base64url");

/** A link to one post's folder, good for 30 minutes. */
export function exportLink(secret: string, origin: string, id: string, now = Date.now()) {
  const expires = now + TTL_MS;
  const url = `${origin}/exports/posts/${id}?expires=${expires}&sig=${sign(secret, id, expires)}`;
  return { url, expiresAt: new Date(expires).toISOString() };
}

const linkQuery = z.object({ expires: z.coerce.number().int().positive(), sig: z.string().min(1).max(100) });

/** GET /exports/posts/:id?expires=&sig= — no session: the signature is the key. */
export function postExportRoutes({ db, env }: Pick<AdminDeps, "db" | "env">) {
  return new Hono<ApiEnv>().get(
    "/posts/:id",
    zValidator("param", z.object({ id: z.guid() }), (r, c) => (r.success ? undefined : c.json(notFound, 404))),
    zValidator("query", linkQuery, (r, c) => (r.success ? undefined : c.json({ error: "This link is incomplete" }, 403))),
    async (c) => {
      const { id } = c.req.valid("param");
      const { expires, sig } = c.req.valid("query");
      const expected = Buffer.from(sign(env.sessionSecret, id, expires));
      const given = Buffer.from(sig);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return c.json({ error: "This link isn't valid" }, 403);
      }
      if (expires < Date.now()) return c.json({ error: "This link has expired; ask the admin panel for a new one" }, 410);
      const row = await postForExport(db, id);
      if (!row) return c.json(notFound, 404);
      return c.json(exportFolder(row.post, row.projectSlug), 200, { "Cache-Control": "no-store" });
    },
  );
}
