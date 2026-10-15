// Suggestion screenshots wait in the private store until triage. Nightly (GET
// /cron/screenshot-cleanup): one that was uploaded but never sent with a suggestion (or whose
// suggestion went, with the account) is deleted after a day, and one left behind by triage is
// finished: published again when accepted (the copy failed), deleted when declined.

import { SUGGESTION_SCREENSHOT_PREFIX } from "@nw/contracts";
import type { Database } from "@nw/db";
import type { Files } from "@nw/object-store";
import { attachedScreenshots, screenshotsAfterTriage } from "@nw/tasks";

import { dropSuggestionScreenshot, publishSuggestionScreenshot } from "./screenshots.js";
import type { Logger } from "./types.js";

/** Keep in step with knowledge/legal/privacy.md. */
export const UNSENT_SCREENSHOT_HOURS = 24;

/** Deletes old screenshots no suggestion points to. Returns how many. One failed delete doesn't stop the rest. */
export async function deleteUnsentScreenshots(db: Database, files: Files | undefined, now = new Date(), logger?: Logger): Promise<number> {
  if (!files?.ready.private) return 0;
  const cutoff = now.getTime() - UNSENT_SCREENSHOT_HOURS * 60 * 60 * 1000;
  const old = (await files.listPrivate(SUGGESTION_SCREENSHOT_PREFIX)).filter((f) => f.uploadedAt.getTime() < cutoff);
  if (old.length === 0) return 0;
  const attached = await attachedScreenshots(db);
  let deleted = 0;
  for (const file of old.filter((f) => !attached.has(f.pathname))) {
    try {
      await files.deletePrivate(file.pathname);
      deleted++;
    } catch (err) {
      logger?.warn("[screenshots] cleanup delete failed:", err instanceof Error ? err.message : err);
    }
  }
  return deleted;
}

/** Finishes triage that a failure left half-done. Returns how many were published and deleted. */
export async function finishTriagedScreenshots(
  db: Database,
  files: Files | undefined,
  logger: Logger,
): Promise<{ published: number; deleted: number }> {
  let published = 0;
  let deleted = 0;
  for (const { taskId, accepted } of await screenshotsAfterTriage(db)) {
    if (accepted) {
      if ((await publishSuggestionScreenshot(db, files, logger, taskId)) === "published") published++;
    } else {
      await dropSuggestionScreenshot(db, files, logger, taskId);
      deleted++;
    }
  }
  return { published, deleted };
}
