// One handle namespace for /u/<handle>: every account's handle, and the older accounts' ids
// (kebab handles, so nobody takes the handle of a member they aren't). Reserved words and the
// prefixes the board makes itself (`anon-`, `contributor-`) can't be chosen. Every
// check-then-write runs under a transaction-level advisory lock on the handle: two people asking
// for the same handle at once are served one after the other.

import { and, eq, ne, or, sql } from "drizzle-orm";

import { isReservedHandle } from "@nw/contracts";
import { members, type Database } from "@nw/db";

import { TaskRuleError } from "./errors.js";

/** Hold the handle until the transaction ends. */
export async function lockHandle(tx: Database, handle: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`nw-handle:${handle}`}))`);
}

/**
 * Is `handle` free for this person? `self` is the account asking: its own handle and id are free
 * for it. Older accounts' ids are kebab handles too, so an id counts as taken.
 */
export async function handleIsFree(
  tx: Database,
  handle: string,
  self: { contributorId?: string; memberId?: string } = {},
): Promise<boolean> {
  const selfId = self.contributorId ?? self.memberId;
  const [taken] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(or(eq(members.handle, handle), eq(members.id, handle)), selfId ? ne(members.id, selfId) : undefined))
    .limit(1);
  return !taken;
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
  // A typed reserved id ("admin", "anon-…") is refused. A generated one (from a name like "Admin"
  // or "Anon") gets "member-" in front, as GitHub logins get "gh-": counting alone would never
  // leave a reserved prefix.
  if (isReservedHandle(wanted)) {
    if (opts.exact) throw new TaskRuleError("invalid", "That handle is reserved. Pick another one.", opts.field);
    wanted = `member-${wanted}`.slice(0, 39).replace(/-+$/, "");
  }
  const stem = wanted.slice(0, 35).replace(/-+$/, "");
  for (let n = 1; n <= 1000; n++) {
    const id = n === 1 ? wanted : `${stem}-${n}`;
    if (isReservedHandle(id)) continue;
    await lockHandle(tx, id);
    if (await handleIsFree(tx, id)) return id;
    if (opts.exact) throw new TaskRuleError("conflict", "That handle is taken", opts.field);
  }
  throw new TaskRuleError("conflict", "Couldn't find a free handle", opts.field);
}
