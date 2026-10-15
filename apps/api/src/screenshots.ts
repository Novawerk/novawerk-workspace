// A suggestion's screenshot after triage, shared by the admin routes and the nightly cron:
// accepted → a public copy without metadata (typed by its own bytes), the private one deleted;
// declined or a duplicate → deleted. When a copy fails (a Blob hiccup) the screenshot stays
// private and attached, and the nightly run tries again; one we can't read is deleted instead.

import { randomUUID } from "node:crypto";

import { formatTaskId } from "@nw/contracts";
import type { Database } from "@nw/db";
import { readPrivate, stripImage, type Files } from "@nw/object-store";
import { forgetScreenshot, pendingScreenshot, publishScreenshot } from "@nw/tasks";

import type { Logger } from "./types.js";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Accepted: publish it. Returns what happened, for the cron's report. */
export async function publishSuggestionScreenshot(
  db: Database,
  files: Files | undefined,
  logger: Logger,
  taskId: number,
): Promise<"published" | "none" | "unavailable" | "unreadable" | "failed"> {
  const pathname = await pendingScreenshot(db, taskId);
  if (!pathname) return "none";
  if (!files?.ready.private || !files.ready.public) return "unavailable";
  const file = await readPrivate(files, pathname).catch((err: unknown) => {
    logger.error(`[screenshots] ${formatTaskId(taskId)}: reading the private copy failed:`, message(err));
    return undefined;
  });
  if (file === undefined) return "failed";
  if (file === null) {
    await forgetScreenshot(db, taskId);
    return "none";
  }
  let clean: ReturnType<typeof stripImage>;
  try {
    clean = stripImage(file.body);
  } catch (err) {
    // Not a PNG or JPEG we can read: it never goes public.
    logger.warn(`[screenshots] ${formatTaskId(taskId)}: unreadable image, deleted:`, message(err));
    await dropSuggestionScreenshot(db, files, logger, taskId);
    return "unreadable";
  }
  try {
    const ext = clean.contentType === "image/png" ? "png" : "jpg";
    const url = await files.putPublic(`tasks/${formatTaskId(taskId)}/screenshot-${randomUUID()}.${ext}`, clean.body, clean.contentType);
    await publishScreenshot(db, taskId, url);
    await files.deletePrivate(pathname).catch((err: unknown) => logger.warn(`[screenshots] private copy not deleted:`, message(err)));
    return "published";
  } catch (err) {
    logger.error(`[screenshots] ${formatTaskId(taskId)}: not published, retried tonight:`, message(err));
    return "failed";
  }
}

/** Declined, a duplicate, or unreadable: the private screenshot goes. */
export async function dropSuggestionScreenshot(db: Database, files: Files | undefined, logger: Logger, taskId: number): Promise<void> {
  const pathname = await forgetScreenshot(db, taskId);
  if (pathname && files?.ready.private) {
    await files.deletePrivate(pathname).catch((err: unknown) => logger.warn("[screenshots] delete failed:", message(err)));
  }
}
