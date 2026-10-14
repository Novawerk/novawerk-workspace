// Accepting a pitch or an application. Each one is a single transaction: the status change and
// the record it creates land together or not at all.
//
// The Initiator rule. Whoever pitched a project becomes its Initiator, but a pitch comes from
// someone outside Novawerk: there is no `members` row to point `project_members` at yet. So:
//   - accepting a pitch links the Initiator right away when a member with the pitch's email
//     already exists;
//   - otherwise the project starts without one, and the link is made the moment that person
//     becomes a member, whether through an accepted application or "Add member" (matched on
//     email, case-insensitive, for every accepted pitch of theirs that has a project);
//   - a member can always add them by hand on the project page.
// We never create a Member just because someone pitched: joining is its own decision.

import { and, eq, like, or, sql } from "drizzle-orm";

import { INITIATOR_ROLE, toHandle, type ApplicationAcceptInput, type SubmissionAcceptInput } from "@nw/contracts";
import {
  memberApplications,
  members,
  projectMembers,
  projectStatusChanges,
  projectSubmissions,
  projects,
  type Database,
  type Member,
  type MemberApplication,
  type Project,
  type ProjectSubmission,
} from "@nw/db";

/** A refusal the route turns into an ApiError: 404 for a missing row, 409 for a taken value. */
export class AcceptError extends Error {
  constructor(
    readonly status: 404 | 409,
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
        sql`lower(${projectSubmissions.email}) = ${member.email.trim().toLowerCase()}`,
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
      if (input.memberId) {
        const [taken] = await tx.select({ id: members.id }).from(members).where(eq(members.id, input.memberId));
        if (taken) throw new AcceptError(409, "Another member already has this handle", "memberId");
        id = input.memberId;
      } else {
        id = await freeHandle(tx, members.id, toHandle(application.name) || "member", 40);
      }
      [member] = await tx
        .insert(members)
        .values({
          id,
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

export interface AcceptedSubmission {
  submission: ProjectSubmission;
  project: Project;
  /** False when the pitch already had a project (accepted before); we reuse it. */
  projectCreated: boolean;
  /** The member linked as Initiator, or null until the submitter becomes a member. */
  initiator: Pick<Member, "id" | "displayName"> | null;
}

/**
 * Accept a pitch: start a `draft` project linked to it (or reuse the one it already has), link
 * the Initiator if they are a member, and set the pitch to accepted.
 */
export async function acceptSubmission(
  db: Database,
  submissionId: string,
  input: SubmissionAcceptInput,
  /** The member accepting it: the first line of the project's timeline. */
  acceptedBy?: string,
): Promise<AcceptedSubmission> {
  return db.transaction(async (tx) => {
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

    const [updated] = await tx
      .update(projectSubmissions)
      .set({ status: "accepted" })
      .where(eq(projectSubmissions.id, submissionId))
      .returning();

    const member = await memberByEmail(tx, submission.email);
    if (member) {
      await tx
        .insert(projectMembers)
        .values({ projectId: project!.id, memberId: member.id, role: INITIATOR_ROLE })
        .onConflictDoNothing();
    }
    return {
      submission: updated!,
      project: project!,
      projectCreated,
      initiator: member ? { id: member.id, displayName: member.displayName } : null,
    };
  });
}

/** True when the pitch already has a project (so "accepted" is consistent). */
export async function submissionHasProject(db: Database, submissionId: string): Promise<boolean> {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.submissionId, submissionId)).limit(1);
  return row !== undefined;
}
