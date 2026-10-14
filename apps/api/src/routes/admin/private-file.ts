// Streaming a file from the private store to a signed-in member: documents and the CVs that came
// with a pitch or an application.

import type { Context } from "hono";

import type { OpenedFile } from "@nw/object-store";

/** Browsers can show these inline; everything else downloads. */
const INLINE = /^(application\/pdf|image\/(jpeg|png|webp|gif|avif))$/;

/** `attachment; filename="..."; filename*=UTF-8''...` with the stored file's extension. */
function disposition(kind: "inline" | "attachment", title: string, pathname: string): string {
  const ext = /\.([a-z0-9]{1,8})$/.exec(pathname)?.[1];
  const name = ext && !title.toLowerCase().endsWith(`.${ext}`) ? `${title}.${ext}` : title;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** The file as the response body, saved under `title` when the browser downloads it. */
export function privateFileResponse(c: Context, file: OpenedFile, title: string) {
  return c.body(file.stream, 200, {
    "Content-Type": file.contentType,
    "Content-Length": String(file.size),
    "Content-Disposition": disposition(INLINE.test(file.contentType) ? "inline" : "attachment", title, file.pathname),
    // Private: never in a shared cache, and the browser must not guess another type.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
}
