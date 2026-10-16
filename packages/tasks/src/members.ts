// A Member's own public profile (NB-ADR-0013): off by default, switched on by the member themself.
// Then an Initiator stands on the contributors wall with their project, and /u/<handle> shows
// them. Members stay Members: nothing here gives a contributor account, and the email never
// leaves.

import { eq } from "drizzle-orm";

import type { MemberSelfUpdateInput } from "@nw/contracts";
import { members, type Database, type Member } from "@nw/db";

import { TaskRuleError, isUniqueViolation } from "./errors.js";
import { claimHandle } from "./handles.js";

const TAKEN = "That handle is taken";

/** PATCH /admin/me. A handle someone else has is a conflict. */
export async function updateMemberProfile(db: Database, memberId: string, patch: MemberSelfUpdateInput): Promise<Member> {
  const [me] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!me) throw new TaskRuleError("not_found", "No such member");
  const fields = { public: patch.publicProfile, handle: patch.profileHandle, bio: patch.profileBio };
  const [row] = await db.transaction(async (tx) => {
    // A new handle: not reserved, not a contributor's or another member's (their id included).
    if (patch.profileHandle && patch.profileHandle !== me.handle) {
      await claimHandle(tx, patch.profileHandle, "profileHandle", { memberId });
    }
    return tx
      .update(members)
      .set(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)))
      .where(eq(members.id, memberId))
      .returning()
      .catch((err: unknown) => {
        if (isUniqueViolation(err)) throw new TaskRuleError("conflict", TAKEN, "profileHandle");
        throw err;
      });
  });
  return row!;
}
