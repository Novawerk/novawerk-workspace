// The admin assistant's tools. Everything reads, except draft_email, which can only queue a
// pending outbox row through @nw/email's queueEmail(); a member still has to approve it.
// List tools leave out email addresses (less personal data in each model request); the get_*
// tools include the one address a draft needs.

import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { defineTool, ToolRegistry } from "@nw/agent-harness";
import {
  APPLICATION_STATUSES,
  OUTBOX_RELATED_TABLES,
  PARTNER_STAGES,
  SUBMISSION_STATUSES,
  type OutboxRelatedTable,
} from "@nw/contracts";
import {
  memberApplications,
  members,
  partners,
  projectMembers,
  projectSubmissions,
  projects,
  type Database,
} from "@nw/db";
import { OutboxError, queueEmail } from "@nw/email";

import type { AdminMember } from "../types.js";

/** What every tool can reach during a turn. */
export interface AdminToolApp {
  db: Database;
  /** The member chatting; drafts are recorded as theirs. */
  member: AdminMember;
}

const limit = z.number().int().min(1).max(50).optional().describe("How many rows, newest first. Default 20.");
const json = (value: unknown) => JSON.stringify(value);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const listSubmissions = defineTool({
  name: "list_submissions",
  description: "List project pitches (newest first), optionally by status. Returns id, project name, submitter name, status, reviewer and date.",
  schema: z.object({ status: z.enum(SUBMISSION_STATUSES).optional(), limit }),
  run: async ({ status, limit: n }, { app }: { app: AdminToolApp }) => {
    const rows = await app.db
      .select({
        id: projectSubmissions.id,
        projectName: projectSubmissions.projectName,
        name: projectSubmissions.name,
        status: projectSubmissions.status,
        reviewerId: projectSubmissions.reviewerId,
        createdAt: projectSubmissions.createdAt,
      })
      .from(projectSubmissions)
      .where(status ? eq(projectSubmissions.status, status) : undefined)
      .orderBy(desc(projectSubmissions.createdAt))
      .limit(n ?? 20);
    return json(rows.map((r) => ({ ...r, createdAt: day(r.createdAt) })));
  },
});

const getSubmission = defineTool({
  name: "get_submission",
  description: "Read one project pitch in full: all five answers, links, the intake summary, review notes, and the project it became.",
  schema: z.object({ id: z.guid() }),
  run: async ({ id }, { app }: { app: AdminToolApp }) => {
    const [row] = await app.db.select().from(projectSubmissions).where(eq(projectSubmissions.id, id)).limit(1);
    if (!row) throw new Error(`No pitch with id ${id}`);
    const [project] = await app.db
      .select({ id: projects.id, slug: projects.slug, status: projects.status })
      .from(projects)
      .where(eq(projects.submissionId, id))
      .limit(1);
    const { consentAt: _consent, updatedAt: _updated, ...pitch } = row;
    return json({ ...pitch, createdAt: day(row.createdAt), project: project ?? null });
  },
});

const listApplications = defineTool({
  name: "list_applications",
  description: "List membership applications (newest first), optionally by status. Returns id, name, city, functions, availability, status and date.",
  schema: z.object({ status: z.enum(APPLICATION_STATUSES).optional(), limit }),
  run: async ({ status, limit: n }, { app }: { app: AdminToolApp }) => {
    const rows = await app.db
      .select({
        id: memberApplications.id,
        name: memberApplications.name,
        city: memberApplications.city,
        functions: memberApplications.functions,
        availability: memberApplications.availability,
        status: memberApplications.status,
        createdAt: memberApplications.createdAt,
      })
      .from(memberApplications)
      .where(status ? eq(memberApplications.status, status) : undefined)
      .orderBy(desc(memberApplications.createdAt))
      .limit(n ?? 20);
    return json(rows.map((r) => ({ ...r, createdAt: day(r.createdAt) })));
  },
});

const getApplication = defineTool({
  name: "get_application",
  description: "Read one membership application in full: background, motivation, links, the intake summary, review notes and the member it became.",
  schema: z.object({ id: z.guid() }),
  run: async ({ id }, { app }: { app: AdminToolApp }) => {
    const [row] = await app.db.select().from(memberApplications).where(eq(memberApplications.id, id)).limit(1);
    if (!row) throw new Error(`No application with id ${id}`);
    const { consentAt: _consent, updatedAt: _updated, ...application } = row;
    return json({ ...application, createdAt: day(row.createdAt) });
  },
});

const listMembers = defineTool({
  name: "list_members",
  description: "List Novawerk members (handle, name, admin access, active, joined) and the projects each works on.",
  schema: z.object({ includeInactive: z.boolean().optional().describe("Also list members who left. Default false.") }),
  run: async ({ includeInactive }, { app }: { app: AdminToolApp }) => {
    const rows = await app.db
      .select({
        id: members.id,
        displayName: members.displayName,
        canAdmin: members.canAdmin,
        active: members.active,
        joinedOn: members.joinedOn,
      })
      .from(members)
      .where(includeInactive ? undefined : eq(members.active, true))
      .orderBy(asc(members.displayName));
    const roles = await app.db
      .select({ memberId: projectMembers.memberId, project: projects.title, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId));
    return json(
      rows.map((m) => ({
        ...m,
        projects: roles.filter((r) => r.memberId === m.id).map(({ project, role }) => ({ project, role })),
      })),
    );
  },
});

const listPartners = defineTool({
  name: "list_partners",
  description: "List sponsors and partners with stage, contact person, owner and last touch. Optionally one stage.",
  schema: z.object({ stage: z.enum(PARTNER_STAGES).optional() }),
  run: async ({ stage }, { app }: { app: AdminToolApp }) => {
    const rows = await app.db
      .select({
        id: partners.id,
        name: partners.name,
        stage: partners.stage,
        primaryContact: partners.primaryContact,
        primaryEmail: partners.primaryEmail,
        owner: partners.owner,
        lastTouchAt: partners.lastTouchAt,
      })
      .from(partners)
      .where(stage ? eq(partners.stage, stage) : undefined)
      .orderBy(asc(partners.name));
    return json(rows.map((r) => ({ ...r, lastTouchAt: day(r.lastTouchAt) })));
  },
});

const listProjects = defineTool({
  name: "list_projects",
  description: "List portfolio projects (title, tagline, status, year, team). Use it to check overlap with a new pitch.",
  schema: z.object({}),
  run: async (_args, { app }: { app: AdminToolApp }) => {
    const rows = await app.db
      .select({
        id: projects.id,
        title: projects.title,
        tagline: projects.tagline,
        description: projects.description,
        status: projects.status,
        year: projects.year,
      })
      .from(projects)
      .orderBy(desc(projects.featured), asc(projects.sortOrder));
    const team = await app.db
      .select({ projectId: projectMembers.projectId, name: members.displayName, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(members, eq(members.id, projectMembers.memberId));
    return json(
      rows.map((p) => ({ ...p, team: team.filter((t) => t.projectId === p.id).map(({ name, role }) => ({ name, role })) })),
    );
  },
});

/** Drafts link back to a real pitch, application or partner, or to nothing. */
async function relatedExists(db: Database, table: OutboxRelatedTable, id: string): Promise<boolean> {
  if (table === "partners") {
    return (await db.select({ id: partners.id }).from(partners).where(eq(partners.id, id)).limit(1)).length > 0;
  }
  if (!z.guid().safeParse(id).success) return false;
  if (table === "project_submissions") {
    const rows = await db.select({ id: projectSubmissions.id }).from(projectSubmissions).where(eq(projectSubmissions.id, id));
    return rows.length > 0;
  }
  const rows = await db.select({ id: memberApplications.id }).from(memberApplications).where(eq(memberApplications.id, id));
  return rows.length > 0;
}

const draftEmail = defineTool({
  name: "draft_email",
  description:
    "Draft an email to someone outside Novawerk. It is queued as pending in the outbox; nothing is sent until a member approves it. Link it to the record it is about.",
  schema: z.object({
    to: z.string().describe("One plain email address."),
    subject: z.string().describe("One line."),
    body: z.string().describe("Plain text. Short sentences, signed Novawerk."),
    relatedTable: z.enum(OUTBOX_RELATED_TABLES).optional().describe("What it is about."),
    relatedId: z.string().optional().describe("The id of that pitch, application or partner."),
  }),
  run: async (args, { app }: { app: AdminToolApp }) => {
    if ((args.relatedTable === undefined) !== (args.relatedId === undefined)) {
      throw new Error("Give relatedTable and relatedId together, or neither.");
    }
    if (args.relatedTable && args.relatedId && !(await relatedExists(app.db, args.relatedTable, args.relatedId))) {
      throw new Error(`No ${args.relatedTable} row with id ${args.relatedId}`);
    }
    try {
      const id = await queueEmail(app.db, { ...args, draftedBy: `assistant:${app.member.id}` });
      return `Queued for approval as outbox email ${id}. Nothing is sent until a member approves it on the Outbox page.`;
    } catch (err) {
      if (err instanceof OutboxError) throw new Error(err.message);
      throw err;
    }
  },
});

/** Fixed set and order (keeps the provider's prompt cache warm). */
export function createAdminTools() {
  return new ToolRegistry<AdminToolApp>([
    listSubmissions,
    getSubmission,
    listApplications,
    getApplication,
    listMembers,
    listPartners,
    listProjects,
    draftEmail,
  ]);
}
