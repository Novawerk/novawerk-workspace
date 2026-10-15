// A Member's own public profile (NB-ADR-0013): off by default, switched on by the member themself.
// Then an Initiator stands on the contributors wall with their project, and /u/<handle> shows
// them. Members stay Members: nothing here gives a contributor account, and the email never
// leaves.

import { eq } from "drizzle-orm";

import type { MemberSelfUpdateInput } from "@nw/contracts";
import { contributors, members, type Database, type Member } from "@nw/db";

import { TaskRuleError, isUniqueViolation } from "./errors.js";

const TAKEN = "That handle is taken";

/** PATCH /admin/me. A public profile needs a handle; a handle a contributor or another member has is a conflict. */
export async function updateMemberProfile(db: Database, memberId: string, patch: MemberSelfUpdateInput): Promise<Member> {
  const [me] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!me) throw new TaskRuleError("not_found", "No such member");
  const handle = patch.profileHandle ?? me.profileHandle;
  if ((patch.publicProfile ?? me.publicProfile) && !handle) {
    throw new TaskRuleError("invalid", "Choose a handle first: it's the address of your profile", "profileHandle");
  }
  if (patch.profileHandle && patch.profileHandle !== me.profileHandle) {
    const [contributor] = await db
      .select({ id: contributors.id })
      .from(contributors)
      .where(eq(contributors.handle, patch.profileHandle))
      .limit(1);
    if (contributor) throw new TaskRuleError("conflict", TAKEN, "profileHandle");
  }
  const [row] = await db
    .update(members)
    .set(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))
    .where(eq(members.id, memberId))
    .returning()
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) throw new TaskRuleError("conflict", TAKEN, "profileHandle");
      throw err;
    });
  return row!;
}
