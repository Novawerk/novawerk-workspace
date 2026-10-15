// One handle namespace for /u/<handle>: contributors' handles, Members' profile handles, and
// Members' ids (so nobody takes the handle of a Member they aren't). Reserved words and the
// prefixes the board makes itself (`anon-`, `contributor-`) can't be chosen. Two tables share it,
// so every check-then-write runs under a transaction-level advisory lock on the handle: two
// people asking for the same handle at once are served one after the other.

import { and, eq, ne, or, sql } from "drizzle-orm";

import { isReservedHandle } from "@nw/contracts";
import { contributors, members, type Database } from "@nw/db";

import { TaskRuleError } from "./errors.js";

/** Hold the handle until the transaction ends. */
export async function lockHandle(tx: Database, handle: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`nw-handle:${handle}`}))`);
}

/**
 * Is `handle` free for this person? `self` is the contributor or member asking (their own
 * handle and, for a member, their own id are free for them).
 */
export async function handleIsFree(
  tx: Database,
  handle: string,
  self: { contributorId?: string; memberId?: string } = {},
): Promise<boolean> {
  const [contributor] = await tx
    .select({ id: contributors.id })
    .from(contributors)
    .where(and(eq(contributors.handle, handle), self.contributorId ? ne(contributors.id, self.contributorId) : undefined))
    .limit(1);
  if (contributor) return false;
  const [member] = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        or(eq(members.profileHandle, handle), eq(members.id, handle)),
        self.memberId ? ne(members.id, self.memberId) : undefined,
      ),
    )
    .limit(1);
  return !member;
}

/** A handle someone chooses: not reserved, not someone else's. Call inside a transaction. */
export async function claimHandle(
  tx: Database,
  handle: string,
  field: string,
  self: { contributorId?: string; memberId?: string },
): Promise<void> {
  if (isReservedHandle(handle)) throw new TaskRuleError("invalid", "That handle is reserved. Pick another one.", field);
  await lockHandle(tx, handle);
  if (!(await handleIsFree(tx, handle, self))) throw new TaskRuleError("conflict", "That handle is taken", field);
}

/**
 * A new Member's id, which is also a handle in this namespace: not a contributor's handle, nor
 * another member's id or profile handle. `exact` (an admin typed it): taken is a conflict on
 * `field`; otherwise count up ("ada-2"…). Call inside a transaction: the id stays locked.
 */
export async function claimMemberId(tx: Database, wanted: string, opts: { exact: boolean; field: string }): Promise<string> {
  for (let n = 1; n <= 1000; n++) {
    const id = n === 1 ? wanted : `${wanted.slice(0, 35).replace(/-+$/, "")}-${n}`;
    await lockHandle(tx, id);
    if (await handleIsFree(tx, id)) return id;
    if (opts.exact) throw new TaskRuleError("conflict", "That handle is taken", opts.field);
  }
  throw new TaskRuleError("conflict", "Couldn't find a free handle", opts.field);
}
