// Bits every /admin router uses.

import { eq } from "drizzle-orm";
import { z } from "zod";

import { members, type Database } from "@nw/db";

import type { AppDeps, Logger } from "../../types.js";

/** What each /admin router gets: the app deps plus a logger. */
export type AdminDeps = AppDeps & { logger: Logger };

/** Any well-formed Postgres uuid; anything else can't match a row. */
export const uuidParam = z.object({ id: z.guid() });

/** Text ids (member handles, partner ids). Loose on purpose: older rows may predate the kebab rule. */
export const textIdParam = z.object({ id: z.string().min(1).max(80) });

/** Integer ids (identity columns). */
export const intIdParam = z.object({ id: z.coerce.number().int().positive() });

export async function memberExists(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: members.id }).from(members).where(eq(members.id, id)).limit(1);
  return row !== undefined;
}
