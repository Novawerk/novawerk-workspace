// Plain-text emails to the team inbox when a form comes in. Every field is listed so the
// team can triage from the inbox; `replyTo` is the submitter.

import type { ProjectSubmissionInput, ResumeRef } from "@nw/contracts";
import type { TeamNotification } from "@nw/email";

import type { Logger, Notifier } from "./types.js";

/** Subjects are one line: collapse newlines and runs of whitespace. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const line = (label: string, value: string | undefined) => `${label}: ${value || "—"}`;
const block = (label: string, value: string) => `${label}:\n${value}\n`;
/** The file stays in the private store: the email names it, the admin panel opens it. */
const cv = (resume: ResumeRef | null | undefined) => line("CV", resume ? `${resume.name} (open it in the admin panel)` : undefined);

export function submissionNotification(input: ProjectSubmissionInput, id: string): TeamNotification {
  return {
    subject: `New project pitch: ${oneLine(input.projectName)}`,
    replyTo: input.email,
    text: [
      `${input.name} pitched a project on novawerk.io/submit. Reply to this email to reach them.`,
      "",
      line("Name", input.name),
      line("Email", input.email),
      line("Project name", input.projectName),
      "",
      block("Product", input.product),
      block("User journey", input.userJourney),
      block("References and what's new", input.referencesAndInnovation),
      block("Team", input.team),
      block("Timeline", input.timeline),
      line("Links", input.links),
      cv(input.resume),
      "",
      `Submission id: ${id}`,
    ].join("\n"),
  };
}

/** The row is already stored, so a failed notification is logged, never thrown. */
export async function notifySafely(notify: Notifier, message: TeamNotification, logger: Logger) {
  try {
    await notify(message);
  } catch (err) {
    logger.error(`[api] notifyTeam failed for "${message.subject}":`, err);
  }
}
