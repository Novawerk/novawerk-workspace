// Usage events are anonymous, but we still don't keep them forever. The privacy notice promises
// 13 months; Vercel Cron runs this daily (GET /cron/analytics-cleanup).

import { lt } from "drizzle-orm";

import { analyticsEvents, type Database } from "@nw/db";

/** Keep in step with knowledge/legal/privacy.md ("How long we keep it"). */
export const ANALYTICS_RETENTION_MONTHS = 13;

/** Deletes usage events older than ANALYTICS_RETENTION_MONTHS. Returns how many. */
export async function deleteExpiredAnalyticsEvents(db: Database, now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ANALYTICS_RETENTION_MONTHS);
  const deleted = await db
    .delete(analyticsEvents)
    .where(lt(analyticsEvents.createdAt, cutoff))
    .returning({ id: analyticsEvents.id });
  return deleted.length;
}
