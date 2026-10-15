// Suggestion screenshots wait in the private store until triage. One that was uploaded but never
// sent with a suggestion (or whose suggestion went, with the account) is deleted after a day.
// Vercel Cron runs this daily (GET /cron/screenshot-cleanup).

import { SUGGESTION_SCREENSHOT_PREFIX } from "@nw/contracts";
import type { Database } from "@nw/db";
import type { Files } from "@nw/object-store";
import { attachedScreenshots } from "@nw/tasks";

/** Keep in step with knowledge/legal/privacy.md. */
export const UNSENT_SCREENSHOT_HOURS = 24;

/** Deletes old screenshots no suggestion points to. Returns how many. */
export async function deleteUnsentScreenshots(db: Database, files: Files | undefined, now = new Date()): Promise<number> {
  if (!files?.ready.private) return 0;
  const cutoff = now.getTime() - UNSENT_SCREENSHOT_HOURS * 60 * 60 * 1000;
  const old = (await files.listPrivate(SUGGESTION_SCREENSHOT_PREFIX)).filter((f) => f.uploadedAt.getTime() < cutoff);
  if (old.length === 0) return 0;
  const attached = await attachedScreenshots(db);
  const unsent = old.filter((f) => !attached.has(f.pathname));
  for (const file of unsent) await files.deletePrivate(file.pathname);
  return unsent.length;
}
