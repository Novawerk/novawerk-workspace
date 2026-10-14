// Storing a pitch or an application, then telling the team and waking the intake agent.
// Shared by the plain forms (/public/submissions, /public/applications) and the Intake Agent's
// Send (/public/intake/sessions/:id/submit), so both land exactly the same way.
//
// Insert and announce are separate so a caller can insert inside a transaction and announce
// after it commits.

import type { MemberApplicationInput, ProjectSubmissionInput, ResumeRef } from "@nw/contracts";
import { memberApplications, projectSubmissions, type Database } from "@nw/db";
import type { Files } from "@nw/object-store";

import { triggerIntakeSafely } from "./agents.js";
import { applicationNotification, notifySafely, submissionNotification } from "./notifications.js";
import type { IntakeTrigger, Logger, Notifier } from "./types.js";

export interface AnnounceDeps {
  notify: Notifier;
  logger: Logger;
  triggerIntake?: IntakeTrigger | undefined;
}

export const RESUME_MISSING = "We can't find your CV any more. Please attach it again.";

/**
 * A CV named in a form must be in the private store (it went up with a ticket from
 * /public/uploads/resume; the contract already checked the pathname). Returns the form issues,
 * or null when there is no CV or it is there. If the store can't be asked, the CV is let
 * through: a hiccup at Blob shouldn't cost someone their application.
 */
export async function resumeIssues(
  files: Files | undefined,
  resume: ResumeRef | null | undefined,
  logger: Logger,
): Promise<Record<string, string[]> | null> {
  if (!resume) return null;
  if (!files?.ready.private) return { resume: [RESUME_MISSING] };
  try {
    return (await files.statPrivate(resume.pathname)) ? null : { resume: [RESUME_MISSING] };
  } catch (err) {
    logger.warn(`[api] could not check the CV ${resume.pathname}:`, err);
    return null;
  }
}

const resumeColumns = (resume: ResumeRef | null | undefined) => ({
  resumePathname: resume?.pathname ?? null,
  resumeName: resume?.name ?? null,
});

export async function insertProjectSubmission(db: Database, input: ProjectSubmissionInput): Promise<string> {
  const [row] = await db
    .insert(projectSubmissions)
    .values({
      name: input.name,
      email: input.email,
      projectName: input.projectName,
      product: input.product,
      userJourney: input.userJourney,
      referencesAndInnovation: input.referencesAndInnovation,
      team: input.team,
      timeline: input.timeline,
      links: input.links || null,
      ...resumeColumns(input.resume),
      consentAt: new Date(),
    })
    .returning({ id: projectSubmissions.id });
  return row!.id;
}

/** Best effort: the row is stored, so failures are logged, never thrown. */
export async function announceProjectSubmission(deps: AnnounceDeps, input: ProjectSubmissionInput, id: string) {
  await notifySafely(deps.notify, submissionNotification(input, id), deps.logger);
  await triggerIntakeSafely(deps.triggerIntake, { table: "project_submissions", id }, deps.logger);
}

export async function insertMemberApplication(db: Database, input: MemberApplicationInput): Promise<string> {
  const [row] = await db
    .insert(memberApplications)
    .values({
      name: input.name,
      email: input.email,
      city: input.city || null,
      functions: input.functions,
      background: input.background,
      motivation: input.motivation,
      availability: input.availability,
      links: input.links || null,
      ...resumeColumns(input.resume),
      consentAt: new Date(),
    })
    .returning({ id: memberApplications.id });
  return row!.id;
}

/** Best effort: the row is stored, so failures are logged, never thrown. */
export async function announceMemberApplication(deps: AnnounceDeps, input: MemberApplicationInput, id: string) {
  await notifySafely(deps.notify, applicationNotification(input, id), deps.logger);
  await triggerIntakeSafely(deps.triggerIntake, { table: "member_applications", id }, deps.logger);
}
