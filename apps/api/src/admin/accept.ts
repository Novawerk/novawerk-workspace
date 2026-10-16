// Accepting a pitch or an application. Each one is a single transaction: the status change and
// the record it creates land together or not at all.
//
// The Initiator rule. Whoever pitched a project becomes its Initiator, and the FIRST acceptance
// of the pitch makes them a Member in the same transaction:
//   - an active member with the pitch's email (case-insensitive) is linked as they are (an admin
//     stays an admin; nothing about them changes);
//   - a deactivated one is refused (409): reactivating is a decision for the Members page, never
//     a side effect of a pitch;
//   - otherwise a Member is created: id from the shared handle namespace (claimMemberId in
//     @nw/tasks handles.ts, locked until we commit; a reserved-looking name gets "member-" in
//     front; a name that gives fewer than 2 characters falls back to the email's local part),
//     name and email from the pitch, no admin rights. They sign in with that email and see their
//     own projects;
//   - a contributor account with the same email stays separate: two identities, never merged.
// Accepting again leaves membership and the team alone (an Initiator may have handed over).
// Declining creates nothing. Two pitches from one email accepted at once take turns (an advisory
// lock on the address), so they make one Member, not two.

import { and, eq, like, or, sql } from "drizzle-orm";

import { INITIATOR_ROLE, toHandle, type ApplicationAcceptInput, type SubmissionAcceptInput } from "@nw/contracts";
import {
  memberApplications,
  members,
  projectMembers,
  projects,
  projectStatusChanges,
  projectSubmissions,
  type Database,
  type Member,
  type MemberApplication,
  type Project,
  type ProjectSubmission,
} from "@nw/db";
import { TaskRuleError, claimMemberId } from "@nw/tasks";

/** A refusal the route turns into an ApiError: 404 for a missing row, 409 for a taken value. */
export class AcceptError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "AcceptError";
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** `base`, or `base-2`, `base-3`… whichever is free in `column` (member ids, project slugs). */
async function freeHandle(
  db: Database,
  column: typeof members.id | typeof projects.slug,
  base: string,
  maxLength: number,
): Promise<string> {
  const stem = base.slice(0, maxLength - 4).replace(/-+$/, "");
  const table = column === members.id ? members : projects;
  const rows = await db
    .select({ value: column })
    .from(table)
    .where(or(eq(column, base), like(column, `${stem}-%`)));
  const taken = new Set(rows.map((r) => r.value));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

async function memberByEmail(db: Database, email: string): Promise<Member | undefined> {
  const [row] = await db
    .select()
    .from(members)
    .where(sql`lower(${members.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return row;
}

/**
 * Make `member` the Initiator of every project that came from an accepted pitch sent with their
 * email. Skips projects they are already on. Returns the project ids it linked.
 */
export async function linkInitiatorProjects(db: Database, member: Pick<Member, "id" | "email">): Promise<string[]> {
  const pitched = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(projectSubmissions, eq(projectSubmissions.id, projects.submissionId))
    .where(
      and(
        eq(projectSubmissions.status, "accepted"),
        sql`lower(${projectSubmissions.email}) = ${(member.email ?? "").trim().toLowerCase()}`,
      ),
    );
  if (pitched.length === 0) return [];
  const linked = await db
    .insert(projectMembers)
    .values(pitched.map((p) => ({ projectId: p.projectId, memberId: member.id, role: INITIATOR_ROLE })))
    .onConflictDoNothing()
    .returning({ projectId: projectMembers.projectId });
  return linked.map((l) => l.projectId);
}

export interface AcceptedApplication {
  application: MemberApplication;
  member: Member;
  /** False when we linked a member who already had the applicant's email. */
  memberCreated: boolean;
  /** Projects the new member now initiates (from their own accepted pitches). */
  initiatorOf: string[];
}

/**
 * Accept an application: create the Member (handle from `input.memberId`, else from the name),
 * or link the member who already has this email (reactivating them if they had left), then set
 * the application to accepted with `member_id`.
 */
export async function acceptApplication(
  db: Database,
  applicationId: string,
  input: ApplicationAcceptInput,
): Promise<AcceptedApplication> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(memberApplications)
      .where(eq(memberApplications.id, applicationId))
      .for("update")
      .limit(1);
    if (!application) throw new AcceptError(404, "Not found");

    let member: Member | undefined;
    if (application.memberId) {
      [member] = await tx.select().from(members).where(eq(members.id, application.memberId)).limit(1);
    }
    member ??= await memberByEmail(tx, application.email);

    let memberCreated = false;
    if (member && !member.active) {
      [member] = await tx.update(members).set({ active: true }).where(eq(members.id, member.id)).returning();
    }
    if (!member) {
      let id: string;
      // One handle namespace with contributors (@nw/tasks handles.ts), locked until we commit.
      if (input.memberId) {
        try {
          id = await claimMemberId(tx, input.memberId, { exact: true, field: "memberId" });
        } catch (err) {
          if (err instanceof TaskRuleError && err.code === "conflict") {
            throw new AcceptError(409, "Another member or contributor already has this handle", "memberId");
          }
          if (err instanceof TaskRuleError) throw new AcceptError(400, err.message, "memberId");
          throw err;
        }
      } else {
        id = await claimMemberId(tx, await freeHandle(tx, members.id, toHandle(application.name) || "member", 40), {
          exact: false,
          field: "memberId",
        });
      }
      [member] = await tx
        .insert(members)
        .values({
          id,
          handle: id,
          displayName: input.displayName ?? application.name.trim(),
          email: application.email.trim().toLowerCase(),
          joinedOn: today(),
        })
        .returning();
      memberCreated = true;
    }

    const [updated] = await tx
      .update(memberApplications)
      .set({ status: "accepted", memberId: member!.id })
      .where(eq(memberApplications.id, applicationId))
      .returning();
    const initiatorOf = await linkInitiatorProjects(tx, member!);
    return { application: updated!, member: member!, memberCreated, initiatorOf };
  });
}

/** What accepting would do about the pitcher, for the accept dialog (GET /admin/submissions/:id). */
export type PitcherPreview =
  | { kind: "create"; handle: string }
  | { kind: "link"; member: Pick<Member, "id" | "displayName" | "active" | "role"> };

/** A Member id for someone with this name and email: from the name, else the email's local part. */
function wantedId(name: string, email: string): string {
  const fromName = toHandle(name, 39);
  if (fromName.length >= 2) return fromName;
  const fromEmail = toHandle(email.split("@")[0] ?? "", 39);
  return fromEmail.length >= 2 ? fromEmail : "member";
}

/** Two accepts for the same address run one after the other until the first one commits. */
async function lockEmail(tx: Database, email: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`nw-member-email:${email.trim().toLowerCase()}`}))`);
}

/**
 * Who accepting this pitch would make its Initiator: the member with its email, or a new Member
 * with this handle (free right now; the accept claims it under a lock and may count on).
 */
export async function previewPitcher(db: Database, submission: Pick<ProjectSubmission, "name" | "email">): Promise<PitcherPreview> {
  const member = await memberByEmail(db, submission.email);
  if (member) {
    return { kind: "link", member: { id: member.id, displayName: member.displayName, active: member.active, role: member.role } };
  }
  // A read-only transaction: the handle's lock ends with it; nothing is written.
  const handle = await db.transaction((tx) =>
    claimMemberId(tx, wantedId(submission.name, submission.email), { exact: false, field: "_form" }),
  );
  return { kind: "create", handle };
}

export interface AcceptedSubmission {
  submission: ProjectSubmission;
  project: Project;
  /** False when the pitch already had a project (accepted before); we reuse it. */
  projectCreated: boolean;
  /** True on the first acceptance: only then are a Member and the Initiator set, and the note sent. */
  firstAcceptance: boolean;
  /**
   * The project's Initiator now. On a first acceptance, the pitcher; on a re-accept, whoever holds
   * the role (or null after a handover that left none).
   */
  initiator: Pick<Member, "id" | "displayName"> | null;
  /** True when accepting created that Member (first acceptance, no member had the email). */
  memberCreated: boolean;
  /**
   * True when accepting made them a Member (created now). False when they already were an active
   * Member. The acceptance email says which.
   */
  addedAsMember: boolean;
}

/**
 * Accept a pitch: start a `draft` project linked to it (or reuse the one it already has), make
 * the pitcher a Member (or find the one with their email) and the project's Initiator, and set
 * the pitch to accepted. One transaction.
 */
export async function acceptSubmission(
  db: Database,
  submissionId: string,
  input: SubmissionAcceptInput,
  /** The member accepting it: the first line of the project's timeline. */
  acceptedBy?: string,
  /**
   * Runs inside the transaction, on the first acceptance only (the acceptance note): a double
   * click can't queue it twice.
   */
  onFirstAcceptance?: (tx: Database, result: AcceptedSubmission) => Promise<void>,
): Promise<AcceptedSubmission> {
  return db.transaction(async (tx) => {
    const [peek] = await tx.select({ email: projectSubmissions.email }).from(projectSubmissions).where(eq(projectSubmissions.id, submissionId));
    if (!peek) throw new AcceptError(404, "Not found");
    // The address first, then the pitch: two pitches from one person can't both create a Member.
    await lockEmail(tx, peek.email);
    const [submission] = await tx
      .select()
      .from(projectSubmissions)
      .where(eq(projectSubmissions.id, submissionId))
      .for("update")
      .limit(1);
    if (!submission) throw new AcceptError(404, "Not found");

    let [project] = await tx.select().from(projects).where(eq(projects.submissionId, submissionId)).limit(1);
    const projectCreated = !project;
    if (!project) {
      let slug: string;
      if (input.slug) {
        const [taken] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.slug, input.slug));
        if (taken) throw new AcceptError(409, "Another project already uses this slug", "slug");
        slug = input.slug;
      } else {
        slug = await freeHandle(tx, projects.slug, toHandle(submission.projectName, 80) || "project", 80);
      }
      [project] = await tx
        .insert(projects)
        .values({
          slug,
          title: input.title ?? submission.projectName.trim(),
          status: "draft",
          year: new Date().getUTCFullYear(),
          submissionId,
        })
        .returning();
      await tx
        .insert(projectStatusChanges)
        .values({ projectId: project!.id, fromStatus: null, toStatus: "draft", changedBy: acceptedBy ?? null });
    }

    const firstAcceptance = submission.status !== "accepted";
    if (!firstAcceptance) {
      // Membership and the team stay as they are: the Initiator may have handed over.
      const [initiator] = await tx
        .select({ id: members.id, displayName: members.displayName })
        .from(projectMembers)
        .innerJoin(members, eq(members.id, projectMembers.memberId))
        .where(and(eq(projectMembers.projectId, project!.id), sql`lower(${projectMembers.role}) = 'initiator'`))
        .limit(1);
      return {
        submission,
        project: project!,
        projectCreated,
        firstAcceptance,
        initiator: initiator ?? null,
        memberCreated: false,
        addedAsMember: false,
      };
    }

    let member = await memberByEmail(tx, submission.email);
    if (member && !member.active) {
      throw new AcceptError(409, `${member.displayName} (${member.id}) is deactivated. Reactivate them in Members first.`);
    }
    let memberCreated = false;
    if (!member) {
      // One handle namespace with contributors, locked until we commit.
      const id = await claimMemberId(tx, wantedId(submission.name, submission.email), { exact: false, field: "_form" });
      [member] = await tx
        .insert(members)
        .values({
          id,
          handle: id,
          displayName: submission.name.trim(),
          email: submission.email.trim().toLowerCase(),
          active: true,
          joinedOn: today(),
        })
        .returning();
      memberCreated = true;
    }
    await tx
      .insert(projectMembers)
      .values({ projectId: project!.id, memberId: member!.id, role: INITIATOR_ROLE })
      .onConflictDoNothing();
    const [updated] = await tx
      .update(projectSubmissions)
      .set({ status: "accepted" })
      .where(eq(projectSubmissions.id, submissionId))
      .returning();
    const result: AcceptedSubmission = {
      submission: updated!,
      project: project!,
      projectCreated,
      firstAcceptance,
      initiator: { id: member!.id, displayName: member!.displayName },
      memberCreated,
      addedAsMember: memberCreated,
    };
    await onFirstAcceptance?.(tx, result);
    return result;
  });
}

/** True when the pitch already has a project (so "accepted" is consistent). */
export async function submissionHasProject(db: Database, submissionId: string): Promise<boolean> {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.submissionId, submissionId)).limit(1);
  return row !== undefined;
}
