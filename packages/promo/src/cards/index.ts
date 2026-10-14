// Render a post's picture to PNG: a template (./templates.ts) filled with the card text and,
// if chosen, one of the project's own pictures. Assembled, never generated: the Nova Star,
// the type and the words on the card are exactly what we put there.
//
// @vercel/og wraps satori (layout → SVG) and resvg (SVG → PNG) and runs in a plain Node or
// Vercel Function. Kept behind its own entry point ("@nw/promo/cards") so agents that only
// draft text never load it.

import { ImageResponse } from "@vercel/og";

import { CARD_FORMATS } from "@nw/contracts";

import type { CardFontLoader } from "./fonts.js";
import { cardText, type CardSpec } from "./layout.js";
import { cardTree } from "./templates.js";

export * from "./fonts.js";
export * from "./layout.js";
export * from "./templates.js";

/** The PNG bytes of one card. */
export async function renderCard(spec: CardSpec, opts: { fonts: CardFontLoader }): Promise<ArrayBuffer> {
  const { width, height } = CARD_FORMATS[spec.format];
  const fonts = await opts.fonts(cardText(spec.card));
  const image = new ImageResponse(cardTree(spec) as never, {
    width,
    height,
    // Without fonts @vercel/og falls back to its built-in face; an empty list would be an error.
    ...(fonts.length ? { fonts } : {}),
  });
  return image.arrayBuffer();
}

/** Picture types the renderer can draw. */
export const CARD_PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif"] as const;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export class CardPhotoError extends Error {
  override name = "CardPhotoError";
}

/** Fetch a picture and inline it as a data: URI for the template. */
export async function photoDataUri(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new CardPhotoError(`We couldn't load the picture: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new CardPhotoError(`We couldn't load the picture (${res.status})`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!(CARD_PHOTO_TYPES as readonly string[]).includes(type)) {
    throw new CardPhotoError(`Cards take PNG, JPEG or GIF pictures; this one is ${type || "of an unknown type"}`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new CardPhotoError("The picture is over 10 MB");
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}
