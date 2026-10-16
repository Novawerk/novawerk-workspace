// /admin/submissions and /admin/applications: the inbox. Review fields, the accept flows, the
// Intake Agent conversation that produced each row, and the CV that came with it.
//
// A pitch gets an answer at three moments (src/admin/pitch-emails.ts): accepting it and
// declining it queue a fixed template in the outbox (unless `email: false`); a call invite is
// drafted by the language model and comes back for the member to edit and queue. A member
// approves every email before it leaves.

import { zValidator } from "@hono/zod-validator";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  APPLICATION_STATUSES,
  SUBMISSION_STATUSES,
  applicationAcceptInput,
  applicationUpdateInput,
  inviteDraftInput,
  submissionAcceptInput,
  submissionDeclineInput,
  submissionUpdateInput,
} from "@nw/contracts";
import { memberApplications, projectSubmissions, type Database } from "@nw/db";
import { queueEmail } from "@nw/email";

import { AcceptError, acceptApplication, acceptSubmission, previewPitcher, submissionHasProject } from "../../admin/accept.js";
import { acceptedEmail, declinedEmail, draftInvite, type DraftedEmail } from "../../admin/pitch-emails.js";
import { intakeTranscript } from "../../admin/transcripts.js";
import { conflict, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import { toMemberRow, type ApiEnv } from "../../types.js";
import { privateFileResponse } from "./private-file.js";
import { memberExists, uuidParam, type AdminDeps } from "./shared.js";
import { FILES_OFF } from "./uploads.js";

const submissionFilter = z.object({ status: z.enum(SUBMISSION_STATUSES).optional() });
const applicationFilter = z.object({ status: z.enum(APPLICATION_STATUSES).optional() });

/**
 * The pitch plus the id of the project it became, if any. The outer column is spelled out:
 * Drizzle drops the table name in single-table selects, which would bind it to `p.id`.
 */
const submissionWithProject = {
  ...getTableColumns(projectSubmissions),
  projectId: sql<string | null>`(select p.id from projects p where p.submission_id = project_submissions.id order by p.created_at limit 1)`,
};

async function getSubmission(db: Database, id: string) {
  const [row] = await db.select(submissionWithProject).from(projectSubmissions).where(eq(projectSubmissions.id, id)).limit(1);
  return row;
}

/** Queue one of our pitch emails as pending, from the member who acted. */
async function queuePitchEmail(db: Database, to: string, submissionId: string, memberId: string, email: DraftedEmail) {
  await queueEmail(db, {
    to,
    ...email,
    draftedBy: `admin:${memberId}`,
    relatedTable: "project_submissions",
    relatedId: submissionId,
  });
}

export function inboxRoutes({ db, adminChat, files }: AdminDeps) {
  /** Stream the CV of a pitch or an application (404 when it came without one). */
  async function resume(c: Context<ApiEnv>, row: { pathname: string | null; name: string | null } | undefined) {
    if (!row?.pathname) return c.json(notFound, 404);
    if (!files?.ready.private) return c.json({ error: FILES_OFF.private }, 503);
    const file = await files.openPrivate(row.pathname);
    if (!file) return c.json({ error: "The CV is missing from storage" }, 404);
    return privateFileResponse(c, file, row.name ?? "CV");
  }

  return (
    new Hono<ApiEnv>()
      // ─── Project submissions ───────────────────────────────────────────────
      .get("/submissions", zValidator("query", submissionFilter, rejectInvalid), async (c) => {
        const { status } = c.req.valid("query");
        const rows = await db
          .select(submissionWithProject)
          .from(projectSubmissions)
          .where(status ? eq(projectSubmissions.status, status) : undefined)
          .orderBy(desc(projectSubmissions.createdAt));
        return c.json(rows, 200);
      })

      .get("/submissions/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const [row] = await db
          .select(submissionWithProject)
          .from(projectSubmissions)
          .where(eq(projectSubmissions.id, c.req.valid("param").id))
          .limit(1);
        if (!row) return c.json(notFound, 404);
        // What accepting would do about the pitcher, so the dialog can say it before anyone clicks.
        const pitcher = row.status === "accepted" ? null : await previewPitcher(db, row);
        return c.json({ ...row, pitcher }, 200);
      })

      .patch(
        "/submissions/:id",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", submissionUpdateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const patch = c.req.valid("json");
          if (patch.reviewerId && !(await memberExists(db, patch.reviewerId))) {
            return c.json(validationFailed({ reviewerId: ["Unknown member"] }), 400);
          }
          // "Accepted" means a project exists. Without one, use the accept route, which creates it.
          if (patch.status === "accepted" && !(await submissionHasProject(db, id))) {
            return c.json(validationFailed({ status: ["Use “Accept and create project” to accept a pitch"] }), 400);
          }
          const [row] = await db
            .update(projectSubmissions)
            .set(patch)
            .where(eq(projectSubmissions.id, id))
            .returning(submissionWithProject);
          return row ? c.json(row, 200) : c.json(notFound, 404);
        },
      )

      .post(
        "/submissions/:id/accept",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", submissionAcceptInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const { email = true, ...input } = c.req.valid("json");
          const member = c.get("member").id;
          try {
            // Only the first acceptance writes to them, decided under the pitch's lock: a double
            // click queues one note. Whether accepting just made them a Member picks the text.
            const result = await acceptSubmission(db, id, input, member, async (tx, accepted) => {
              if (!email) return;
              await queuePitchEmail(
                tx,
                accepted.submission.email,
                id,
                member,
                acceptedEmail(accepted.submission, { addedAsMember: accepted.addedAsMember }),
              );
            });
            const emailQueued = email && result.firstAcceptance;
            return c.json({ ...result, emailQueued }, 200);
          } catch (err) {
            if (!(err instanceof AcceptError)) throw err;
            if (err.status === 404) return c.json(notFound, 404);
            if (err.status === 400) return c.json(validationFailed({ [err.field ?? "_form"]: [err.message] }), 400);
            return c.json(conflict(err.field ?? "_form", err.message), 409);
          }
        },
      )

      .post(
        "/submissions/:id/decline",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", submissionDeclineInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const { email = true } = c.req.valid("json");
          const before = await getSubmission(db, id);
          if (!before) return c.json(notFound, 404);
          if (before.status === "accepted") {
            return c.json({ error: "This pitch is a project now. Archive the project instead." }, 409);
          }
          const [submission] = await db
            .update(projectSubmissions)
            .set({ status: "declined" })
            .where(eq(projectSubmissions.id, id))
            .returning(submissionWithProject);
          const emailQueued = email && before.status !== "declined";
          if (emailQueued) await queuePitchEmail(db, before.email, id, c.get("member").id, declinedEmail(before));
          return c.json({ submission: submission!, emailQueued }, 200);
        },
      )

      .post(
        "/submissions/:id/invite",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", inviteDraftInput, rejectInvalid),
        async (c) => {
          const pitch = await getSubmission(db, c.req.valid("param").id);
          if (!pitch) return c.json(notFound, 404);
          const provider = adminChat && "provider" in adminChat ? adminChat.provider : undefined;
          const draft = await draftInvite(provider, pitch, c.req.valid("json"));
          return c.json({ to: pitch.email, ...draft }, 200);
        },
      )

      .get("/submissions/:id/transcript", zValidator("param", uuidParam, notFoundIfInvalid), async (c) =>
        c.json({ transcript: await intakeTranscript(db, { submissionId: c.req.valid("param").id }) }, 200),
      )

      .get("/submissions/:id/resume", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const [row] = await db
          .select({ pathname: projectSubmissions.resumePathname, name: projectSubmissions.resumeName })
          .from(projectSubmissions)
          .where(eq(projectSubmissions.id, c.req.valid("param").id))
          .limit(1);
        return resume(c, row);
      })

      // ─── Member applications ───────────────────────────────────────────────
      .get("/applications", zValidator("query", applicationFilter, rejectInvalid), async (c) => {
        const { status } = c.req.valid("query");
        const rows = await db
          .select()
          .from(memberApplications)
          .where(status ? eq(memberApplications.status, status) : undefined)
          .orderBy(desc(memberApplications.createdAt));
        return c.json(rows, 200);
      })

      .get("/applications/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const [row] = await db
          .select()
          .from(memberApplications)
          .where(eq(memberApplications.id, c.req.valid("param").id))
          .limit(1);
        return row ? c.json(row, 200) : c.json(notFound, 404);
      })

      .patch(
        "/applications/:id",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", applicationUpdateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const patch = c.req.valid("json");
          if (patch.reviewerId && !(await memberExists(db, patch.reviewerId))) {
            return c.json(validationFailed({ reviewerId: ["Unknown member"] }), 400);
          }
          if (patch.memberId && !(await memberExists(db, patch.memberId))) {
            return c.json(validationFailed({ memberId: ["Unknown member"] }), 400);
          }
          // "Accepted" means a member exists: link one here, or use the accept route to create one.
          if (patch.status === "accepted" && !patch.memberId) {
            const [current] = await db
              .select({ memberId: memberApplications.memberId })
              .from(memberApplications)
              .where(eq(memberApplications.id, id))
              .limit(1);
            if (current && !current.memberId) {
              return c.json(validationFailed({ status: ["Use “Accept as member” to accept an application"] }), 400);
            }
          }
          const [row] = await db.update(memberApplications).set(patch).where(eq(memberApplications.id, id)).returning();
          return row ? c.json(row, 200) : c.json(notFound, 404);
        },
      )

      .post(
        "/applications/:id/accept",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", applicationAcceptInput, rejectInvalid),
        async (c) => {
          try {
            const accepted = await acceptApplication(db, c.req.valid("param").id, c.req.valid("json"));
            return c.json({ ...accepted, member: toMemberRow(accepted.member) }, 200);
          } catch (err) {
            if (!(err instanceof AcceptError)) throw err;
            if (err.status === 404) return c.json(notFound, 404);
            if (err.status === 400) return c.json(validationFailed({ [err.field ?? "_form"]: [err.message] }), 400);
            return c.json(conflict(err.field ?? "_form", err.message), 409);
          }
        },
      )

      .get("/applications/:id/transcript", zValidator("param", uuidParam, notFoundIfInvalid), async (c) =>
        c.json({ transcript: await intakeTranscript(db, { applicationId: c.req.valid("param").id }) }, 200),
      )

      .get("/applications/:id/resume", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const [row] = await db
          .select({ pathname: memberApplications.resumePathname, name: memberApplications.resumeName })
          .from(memberApplications)
          .where(eq(memberApplications.id, c.req.valid("param").id))
          .limit(1);
        return resume(c, row);
      })
  );
}
