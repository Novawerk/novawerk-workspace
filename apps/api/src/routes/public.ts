// Public routes: the portfolio for novawerk.io, the three website forms, upload tickets for
// the CV a visitor may attach to a pitch or an application, and the newsletter's confirm and
// unsubscribe links (src/newsletter.ts).

import { randomUUID } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import {
  MAX_RESUME_BYTES,
  NEWSLETTER_PATHS,
  RESUME_PREFIX,
  memberApplicationInput,
  newsletterConfirmQuery,
  newsletterSignupInput,
  newsletterUnsubscribeQuery,
  projectSubmissionInput,
  resumeUploadInput,
  type PublicProject,
  type PublicProjectStatus,
  type ResumeUploadTicket,
} from "@nw/contracts";
import {
  PUBLIC_PROJECT_STATUSES,
  members,
  projectMembers,
  projects,
  type Database,
} from "@nw/db";
import { newsletterConfirmUrl } from "@nw/email";
import { safeFilename } from "@nw/object-store";

import { recordServerEvent } from "../analytics/record.js";
import {
  announceMemberApplication,
  announceProjectSubmission,
  insertMemberApplication,
  insertProjectSubmission,
  resumeIssues,
} from "../forms.js";
import { rejectInvalid, rejectInvalidForm, validationFailed } from "../http.js";
import { FixedWindowLimiter, clientIp } from "../intake-chat/rate-limit.js";
import { confirmSubscription, requestSubscription, unsubscribe } from "../newsletter.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

/** Forms are a few KB; anything bigger is not a person typing. */
const MAX_BODY_BYTES = 64 * 1024;

/** CV tickets per client IP per hour (in-memory, per instance: a brake, not a wall). */
export const RESUME_TICKETS_PER_HOUR = 10;

/** Newsletter signups per client IP per hour (in-memory, per instance). Per address: src/newsletter.ts. */
export const SIGNUPS_PER_HOUR = 20;

const RESUMES_OFF = "CV uploads are off right now. Add a link to your CV instead.";

export function publicRoutes({
  db,
  env,
  notify,
  logger,
  triggerIntake,
  files,
  sendNewsletterConfirmation,
}: AppDeps & { logger: Logger }) {
  const announce = { notify, logger, triggerIntake };
  const resumeTickets = new FixedWindowLimiter(RESUME_TICKETS_PER_HOUR, 60 * 60_000);
  const signups = new FixedWindowLimiter(SIGNUPS_PER_HOUR, 60 * 60_000);
  const webPage = (path: string) => `${env.publicUrls.webUrl}${path}`;
  return new Hono<ApiEnv>()
    .use(
      "*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ error: "Request body too large" }, 413),
      }),
    )

    .get("/projects", async (c) => c.json(await listPublicProjects(db), 200))

    // The file goes from the browser straight to the private store; this only hands out a token
    // for one new pathname, one type and at most MAX_RESUME_BYTES. Unsent CVs are swept daily
    // (GET /cron/resume-cleanup).
    .post("/uploads/resume", zValidator("json", resumeUploadInput, rejectInvalid), async (c) => {
      if (!files?.ready.private) return c.json({ error: RESUMES_OFF }, 503);
      if (!resumeTickets.take(clientIp(c))) {
        return c.json({ error: "Too many uploads from your network. Please try again later." }, 429);
      }
      const { filename, contentType } = c.req.valid("json");
      const ticket = await files.uploadTicket("private", {
        pathname: `${RESUME_PREFIX}${randomUUID()}-${safeFilename(filename)}`,
        contentTypes: [contentType],
        maxBytes: MAX_RESUME_BYTES,
      });
      return c.json({ token: ticket.token, pathname: ticket.pathname } satisfies ResumeUploadTicket, 200);
    })

    .post("/submissions", zValidator("json", projectSubmissionInput, rejectInvalidForm), async (c) => {
      const input = c.req.valid("json");
      const cv = await resumeIssues(files, input.resume, logger);
      if (cv) return c.json(validationFailed(cv), 400);
      const id = await insertProjectSubmission(db, input);
      await recordServerEvent(db, { name: "form_received", props: { form: "pitch", via: "form", turns: null } }, logger);
      await announceProjectSubmission(announce, input, id);
      return c.json({ ok: true as const, id }, 201);
    })

    .post("/applications", zValidator("json", memberApplicationInput, rejectInvalidForm), async (c) => {
      const input = c.req.valid("json");
      const cv = await resumeIssues(files, input.resume, logger);
      if (cv) return c.json(validationFailed(cv), 400);
      const id = await insertMemberApplication(db, input);
      await recordServerEvent(db, { name: "form_received", props: { form: "join", via: "form", turns: null } }, logger);
      await announceMemberApplication(announce, input, id);
      return c.json({ ok: true as const, id }, 201);
    })

    // Double opt-in: store a pending row and email a confirmation link. The answer is the same
    // for a new, pending or confirmed address, so the form can't tell who is on the list.
    .post("/subscribe", zValidator("json", newsletterSignupInput, rejectInvalidForm), async (c) => {
      if (!sendNewsletterConfirmation) return c.json({ error: "The newsletter isn't set up here yet." }, 503);
      if (!signups.take(clientIp(c))) {
        return c.json({ error: "Too many signups from your network. Please try again later." }, 429);
      }
      const { email } = c.req.valid("json");
      const token = await requestSubscription(db, email);
      if (token) {
        await sendNewsletterConfirmation(email.toLowerCase(), newsletterConfirmUrl(env.publicUrls.apiUrl, token)).catch(
          (err: unknown) => logger.error("[newsletter] confirmation email failed:", err),
        );
      }
      await recordServerEvent(db, { name: "form_received", props: { form: "newsletter", via: "form", turns: null } }, logger);
      return c.json({ ok: true as const }, 200);
    })

    // The link in the confirmation email. A browser opens it, so the answer is a page.
    .get("/newsletter/confirm", async (c) => {
      const query = newsletterConfirmQuery.safeParse(c.req.query());
      const confirmed = query.success && (await confirmSubscription(db, query.data.token));
      return c.redirect(webPage(confirmed ? NEWSLETTER_PATHS.subscribed : NEWSLETTER_PATHS.linkExpired), 303);
    })

    // List-Unsubscribe points here. GET only shows the page with the button (link scanners
    // fetch with GET); POST unsubscribes: the mail client's one-click (RFC 8058, body
    // `List-Unsubscribe=One-Click`) and that page's button.
    .get("/newsletter/unsubscribe", (c) => {
      const query = newsletterUnsubscribeQuery.safeParse(c.req.query());
      const search = query.success ? `?token=${query.data.token}` : "";
      return c.redirect(webPage(`${NEWSLETTER_PATHS.unsubscribe}${search}`), 303);
    })
    .post("/newsletter/unsubscribe", zValidator("query", newsletterUnsubscribeQuery, rejectInvalid), async (c) => {
      await unsubscribe(db, c.req.valid("query").token);
      return c.json({ ok: true as const }, 200);
    });
}

/** Projects in a public status: featured first, then sort order, then title. */
export async function listPublicProjects(db: Database): Promise<PublicProject[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      tagline: projects.tagline,
      description: projects.description,
      status: projects.status,
      year: projects.year,
      link: projects.link,
      coverUrl: projects.coverUrl,
      featured: projects.featured,
    })
    .from(projects)
    .where(inArray(projects.status, [...PUBLIC_PROJECT_STATUSES]))
    .orderBy(desc(projects.featured), asc(projects.sortOrder), asc(projects.title));
  if (rows.length === 0) return [];

  const team = await db
    .select({ projectId: projectMembers.projectId, name: members.displayName, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(members, eq(members.id, projectMembers.memberId))
    .where(
      inArray(
        projectMembers.projectId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(members.displayName));

  return rows.map(({ id, status, ...project }) => ({
    ...project,
    status: status as PublicProjectStatus,
    team: team.filter((t) => t.projectId === id).map(({ name, role }) => ({ name, role })),
  }));
}
