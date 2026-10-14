// POST /admin/cards — one post picture as PNG. Stateless: the editor sends the card it shows
// (text, kind, language, format, picture), so the preview follows every keystroke and the
// download is the same picture.
//
// The picture must be one a project or a post already uses (a project's cover or gallery, a
// post's own pictures or card photo): the API fetches it, and we don't fetch arbitrary links on
// a member's say-so. The renderer (@nw/promo/cards) and
// its fonts load on the first request, so the other routes don't pay for them at cold start.

import { zValidator } from "@hono/zod-validator";
import { eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { cardRenderInput } from "@nw/contracts";
import { posts, projects, type Database } from "@nw/db";
import type { CardFontLoader } from "@nw/promo/cards";

import { rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import type { AdminDeps } from "./shared.js";

async function isKnownPicture(db: Database, url: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.coverUrl, url), sql`${projects.gallery} @> ${JSON.stringify([{ url }])}::jsonb`))
    .limit(1);
  if (project) return true;
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(or(eq(posts.photoUrl, url), sql`${posts.images} @> ${JSON.stringify([{ url }])}::jsonb`))
    .limit(1);
  return post !== undefined;
}

export function cardRoutes({ db, logger, cards }: AdminDeps) {
  let fonts: CardFontLoader | undefined = cards?.fonts;
  const renderer = () => import("@nw/promo/cards");

  return new Hono<ApiEnv>().post("/", zValidator("json", cardRenderInput, rejectInvalid), async (c) => {
    const { photoUrl, samplePhoto, ...spec } = c.req.valid("json");
    const { CardPhotoError, PHOTO_PLACEHOLDER, createFontLoader, photoDataUri, renderCard } = await renderer();
    fonts ??= createFontLoader({ warn: (m) => logger.warn(m) });

    let photo: string | null = samplePhoto && !photoUrl ? PHOTO_PLACEHOLDER : null;
    if (photoUrl) {
      if (!(await isKnownPicture(db, photoUrl))) {
        return c.json(validationFailed({ photoUrl: ["Pick the project's cover, one of its gallery pictures, or one of the post's"] }), 400);
      }
      try {
        photo = await photoDataUri(photoUrl, cards?.fetch);
      } catch (err) {
        if (err instanceof CardPhotoError) return c.json(validationFailed({ photoUrl: [err.message] }), 422);
        throw err;
      }
    }

    let png: ArrayBuffer;
    try {
      png = await renderCard({ ...spec, photo }, { fonts });
    } catch (err) {
      // A picture that claims to be a PNG or JPEG but isn't one is the likely cause.
      if (!photo) throw err;
      logger.warn("[api] card with a picture failed to render:", err);
      return c.json(validationFailed({ photoUrl: ["We couldn't draw this picture. Try another one."] }), 422);
    }
    return c.body(png, 200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
  });
}
