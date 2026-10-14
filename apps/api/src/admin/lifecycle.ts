// A project's lifecycle as the API sees it: every status change is written down, launching
// sets the launch day if nobody did, and the posts the project has reached are planned on the
// spot. The promo agent is woken to draft them (its daily run is the safety net).

import { isoDay, syncPosts } from "@nw/promo/lifecycle";
import { projectStatusChanges, type Database, type Project } from "@nw/db";

import { triggerPromoSafely } from "../agents.js";
import type { Logger, PromoTrigger } from "../types.js";

export const today = () => isoDay(new Date());

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Write one line of the project's timeline. */
export async function recordStatusChange(
  db: Database | Tx,
  change: { projectId: string; from: Project["status"] | null; to: Project["status"]; by: string | null },
) {
  await db.insert(projectStatusChanges).values({
    projectId: change.projectId,
    fromStatus: change.from,
    toStatus: change.to,
    changedBy: change.by,
  });
}

/** Plan the posts a project has reached; wake the writer when there are new ones. Returns how many. */
export async function planPosts(
  deps: { db: Database; triggerPromo?: PromoTrigger; logger: Logger },
  projectId: string,
): Promise<number> {
  try {
    const created = await syncPosts(deps.db, { today: today(), projectId });
    if (created.length) await triggerPromoSafely(deps.triggerPromo, { projectId }, deps.logger);
    return created.length;
  } catch (err) {
    // Planning is a convenience on top of the save; the agent's daily run catches up.
    deps.logger.error(`[api] could not plan posts for project ${projectId}:`, err);
    return 0;
  }
}
