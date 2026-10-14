// The single source of truth for every Postgres table in Novawerk.
// The website, the admin panel, the API and the agents all import from here.
// Change a table → `pnpm --filter @nw/db db:generate` → commit the new migration.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── People ──────────────────────────────────────────────────────────────────

/** Everyone is a Member — no tiers. `canAdmin` is a permission, not a rank. */
export const members = pgTable("members", {
  /** kebab handle, e.g. `haodong` */
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  /** The Google account used to sign in to the admin panel. */
  email: text("email").notNull().unique(),
  canAdmin: boolean("can_admin").notNull().default(false),
  joinedOn: date("joined_on"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/**
 * One-time codes for signing in by email (members without a Google account). Only a hash is
 * kept; a code lives 10 minutes, allows 5 tries, and works once.
 */
export const signInCodes = pgTable(
  "sign_in_codes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Lower-cased. */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("sign_in_codes_email_idx").on(t.email, t.createdAt)],
);

// ─── Portfolio (shown on the website, edited in the admin panel) ─────────────

export const projectStatus = pgEnum("project_status", [
  "draft",
  "planning",
  "building",
  "launching",
  "launched",
  "archived",
]);

/** Statuses that appear on the public website. */
export const PUBLIC_PROJECT_STATUSES = ["planning", "building", "launching", "launched"] as const;

export type GalleryImage = { url: string; caption?: string };

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  tagline: text("tagline"),
  /** One or two sentences for the card. */
  description: text("description").notNull().default(""),
  /** Long-form Markdown for a future detail page. */
  body: text("body"),
  status: projectStatus("status").notNull().default("draft"),
  year: integer("year"),
  link: text("link"),
  coverUrl: text("cover_url"),
  gallery: jsonb("gallery").$type<GalleryImage[]>().notNull().default([]),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
  /**
   * Launch day ("T"). Planned while the project is launching, the real day once it launched.
   * The posts after launch (T+10, T+30, T+90) count from it.
   */
  launchDate: date("launch_date"),
  submissionId: uuid("submission_id").references(() => projectSubmissions.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Who works on which project. `role` is free text: "Initiator", "Developer", "Design"… */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.memberId] })],
);

// ─── Project lifecycle ───────────────────────────────────────────────────────

/** Every status change of a project: its timeline, and where the post schedule counts from. */
export const projectStatusChanges = pgTable(
  "project_status_changes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null when the project was created with `toStatus`. */
    fromStatus: projectStatus("from_status"),
    toStatus: projectStatus("to_status").notNull(),
    changedBy: text("changed_by").references(() => members.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_status_changes_project_idx").on(t.projectId, t.changedAt)],
);

/** One deliverable: an artifact, one named owner, what "done" means, a date. */
export const projectDeliverables = pgTable(
  "project_deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The artifact, e.g. "Seed list of 20 restaurants". */
    title: text("title").notNull(),
    ownerId: text("owner_id").references(() => members.id, { onDelete: "set null" }),
    /** How we know it is done, e.g. "Public on Notion". */
    doneWhen: text("done_when"),
    dueOn: date("due_on"),
    /** Null while open. */
    doneOn: date("done_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_deliverables_project_idx").on(t.projectId)],
);

// ─── Posts (the public story of each project, drafted by the promo agent) ───

/**
 * The six moments of a project we post about (knowledge/community/promotion), and `custom`:
 * anything else (an open day, a call for builders, a thank-you), named by its `label`.
 */
export const postKind = pgEnum("post_kind", [
  "kickoff",
  "progress",
  "behind_the_scenes",
  "launch",
  "ten_day",
  "retro",
  "custom",
]);

export const postStatus = pgEnum("post_status", ["planned", "drafted", "approved", "published", "skipped"]);

/** What goes on the picture. Every field may be empty; the template leaves it out. */
export type PostCard = {
  eyebrow: string;
  headline: string;
  lede: string;
  points: string[];
  quote: { text: string; by: string };
  stats: { value: string; label: string }[];
  footer: string;
};

/** One language version of a post: the text for the platforms and the picture. */
export type PostCopy = { title: string; body: string; card: PostCard };

/**
 * Both native versions. Not translations of each other: each is written for its own readers.
 * A post in one language (`posts.langs`) leaves the other one empty.
 */
export type PostContent = { zh: PostCopy; en: PostCopy };

export type PostLang = "zh" | "en";

/** One of a post's own pictures: a photo, a screenshot, an image made with any tool. */
export type PostImage = {
  url: string;
  alt?: string;
  /** Only in this language's version (a picture with Chinese text on it, say). */
  lang?: PostLang;
};

/**
 * One public post: "Kiez Pantry · launch", "Kiez Pantry · week 4", "Open day". The promo agent
 * plans a project's lifecycle posts from its dates and drafts them; members add any other post
 * by hand, or write it in the repo (posts/, synced on merge). A member edits, approves, posts it
 * by hand and marks it published.
 */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for a post about Novawerk itself. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: postKind("kind").notNull(),
    /** The name of a custom post ("Open day"). Lifecycle posts are named by their kind. */
    label: text("label"),
    /**
     * Which one of its kind: the week for progress posts, the day for retros (30, 90), a running
     * number for custom posts, else 0.
     */
    seq: integer("seq").notNull().default(0),
    dueOn: date("due_on").notNull(),
    status: postStatus("status").notNull().default("planned"),
    /** The language versions it has: both, or only one. */
    langs: text("langs").array().$type<PostLang[]>().notNull().default(sql`'{zh,en}'::text[]`),
    /** Where it goes. Null: the usual platforms for its kind. */
    platforms: text("platforms").array().$type<string[]>(),
    /** The template card is the first picture. Off: only its own pictures, or none. */
    withCard: boolean("with_card").notNull().default(true),
    /** Its own pictures, after the card, in order. Public URLs. */
    images: jsonb("images").$type<PostImage[]>().notNull().default([]),
    /** What a member tells the writer: this week's story, real quotes, real numbers. */
    brief: text("brief"),
    /** The photo on the card: the project's cover, one from its gallery, or one of its own pictures. */
    photoUrl: text("photo_url"),
    content: jsonb("content").$type<PostContent>(),
    /**
     * Posts written in the repo: their folder ("posts/2026-10-open-day"). The files are the
     * source: the sync on merge writes them here, and the admin panel doesn't edit them.
     */
    sourcePath: text("source_path").unique(),
    /** The folder's hash at the last sync. The sync rewrites a post only when its files changed. */
    sourceHash: text("source_hash"),
    /** The commit the last sync came from. */
    sourceCommit: text("source_commit"),
    /** Set when someone asks for a (new) draft; the promo agent clears it. */
    draftRequestedAt: timestamp("draft_requested_at", { withTimezone: true }),
    draftedAt: timestamp("drafted_at", { withTimezone: true }),
    /** Why the last draft failed. */
    draftError: text("draft_error"),
    approvedBy: text("approved_by").references(() => members.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** When a member marked it posted. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("posts_project_kind_seq_key").on(t.projectId, t.kind, t.seq),
    index("posts_status_idx").on(t.status),
  ],
);

// ─── Intake (written by the website forms) ───────────────────────────────────

export const submissionStatus = pgEnum("submission_status", [
  "new",
  "discussing",
  "accepted",
  "declined",
]);

/** Someone pitches an idea they want to start at Novawerk. They become its Initiator. */
export const projectSubmissions = pgTable(
  "project_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    projectName: text("project_name").notNull(),
    product: text("product").notNull(),
    userJourney: text("user_journey").notNull(),
    referencesAndInnovation: text("references_and_innovation").notNull(),
    team: text("team").notNull(),
    timeline: text("timeline").notNull(),
    links: text("links"),
    /** The CV they attached, in the private file store (`_resumes/…`). */
    resumePathname: text("resume_pathname"),
    /** The CV's file name as they picked it. */
    resumeName: text("resume_name"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    aiSummary: text("ai_summary"),
    status: submissionStatus("status").notNull().default("new"),
    reviewerId: text("reviewer_id").references(() => members.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_submissions_status_idx").on(t.status)],
);

export const applicationStatus = pgEnum("application_status", [
  "new",
  "reviewing",
  "accepted",
  "declined",
]);

/** Someone wants to join the community as a Member. Not tied to a project. */
export const memberApplications = pgTable(
  "member_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    city: text("city"),
    /** PM, Developer, Design, Research, Marketing, Operations, Other */
    functions: text("functions").array().notNull().default([]),
    background: text("background").notNull(),
    motivation: text("motivation").notNull(),
    availability: text("availability").notNull(),
    links: text("links"),
    /** The CV they attached, in the private file store (`_resumes/…`). */
    resumePathname: text("resume_pathname"),
    /** The CV's file name as they picked it. */
    resumeName: text("resume_name"),
    /** When they accepted the privacy note. */
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    aiSummary: text("ai_summary"),
    status: applicationStatus("status").notNull().default("new"),
    reviewerId: text("reviewer_id").references(() => members.id, { onDelete: "set null" }),
    /** The Member record created when the application is accepted. */
    memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("member_applications_status_idx").on(t.status)],
);

// ─── Agent chats: the Intake Agent (/submit, /join) and the admin assistant ──
// A visitor's conversation with the intake assistant, or a member's with the admin assistant
// (`agent` says which). Holds personal data (the chat transcript, the draft): the privacy
// notice must cover it.

export const agentSessionStatus = pgEnum("agent_session_status", ["open", "submitted"]);

export const agentSessions = pgTable("agent_sessions", {
  /** The visitor's only key to the conversation (kept in their browser). */
  id: uuid("id").primaryKey().defaultRandom(),
  /** Which agent runs it, e.g. `intake`. */
  agent: text("agent").notNull(),
  /** Rendered once at creation and never changed (keeps the model's prompt cache warm). */
  systemPrompt: text("system_prompt").notNull(),
  /** The pitch / application being drafted (IntakeDraft in @nw/contracts). */
  draft: jsonb("draft").$type<unknown>().notNull(),
  status: agentSessionStatus("status").notNull().default("open"),
  userTurns: integer("user_turns").notNull().default(0),
  lastInputTokens: integer("last_input_tokens").notNull().default(0),
  /**
   * Cross-instance turn lock: set while a reply is streaming, cleared when it ends. Expires on
   * its own if an instance dies mid-turn. Serverless instances share no memory, so this lives here.
   */
  turnLockedUntil: timestamp("turn_locked_until", { withTimezone: true }),
  /** The row created when the visitor pressed Send. */
  submissionId: uuid("submission_id").references(() => projectSubmissions.id, { onDelete: "set null" }),
  applicationId: uuid("application_id").references(() => memberApplications.id, { onDelete: "set null" }),
  /** The member who owns the chat (`admin-assistant` sessions). Null for visitors' intake chats. */
  memberId: text("member_id").references(() => members.id, { onDelete: "cascade" }),
  /** The post a `post-writer` chat is about: one shared chat per post, for every member. */
  postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Append-only history, in the agent harness's provider-neutral message format. */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("agent_messages_session_idx").on(t.sessionId, t.id)],
);

/** One row per turn: every model request, tool call, usage and timing. For debugging. */
export const agentTraces = pgTable(
  "agent_traces",
  {
    /** The turn id. */
    id: text("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("agent_traces_session_idx").on(t.sessionId, t.createdAt)],
);

/**
 * The newsletter list, with double opt-in. Someone counts as subscribed only when
 * `confirmedAt` is set and `subscribed` is still true (`isConfirmedSubscriber`).
 */
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Lower-cased. */
  email: text("email").notNull().unique(),
  /**
   * False once they unsubscribe: the row stays as the "unsubscribed" marker, so we never email
   * them again. True on its own means nothing yet; it needs `confirmedAt`.
   */
  subscribed: boolean("subscribed").notNull().default(true),
  source: text("source").notNull().default("website"),
  /** When they clicked the link in the confirmation email. Null: pending. */
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  /** SHA-256 of the token in the latest confirmation email; the token itself is never stored. */
  confirmTokenHash: text("confirm_token_hash").unique(),
  confirmTokenExpiresAt: timestamp("confirm_token_expires_at", { withTimezone: true }),
  /** Rate limit on confirmation emails per address: the window's start and how many went out in it. */
  confirmWindowStartedAt: timestamp("confirm_window_started_at", { withTimezone: true }),
  confirmSendCount: integer("confirm_send_count").notNull().default(0),
  /** In every issue's unsubscribe link and List-Unsubscribe header. Never changes. */
  unsubscribeToken: uuid("unsubscribe_token").notNull().unique().defaultRandom(),
  createdAt: createdAt(),
});

/** Where-clause for the people we may send an issue to: confirmed and not unsubscribed. */
export const isConfirmedSubscriber = sql`${newsletterSubscribers.subscribed} and ${newsletterSubscribers.confirmedAt} is not null`;

// ─── Partners and money ──────────────────────────────────────────────────────

export const partnerStage = pgEnum("partner_stage", [
  "intro",
  "follow-up",
  "grant-ask",
  "renewal",
  "closed",
]);

/** Sponsor / partner CRM. Narrative history lives in records/partners/<id>.md. */
export const partners = pgTable(
  "partners",
  {
    /** Matches the record slug, e.g. `acme-foundation`. */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    stage: partnerStage("stage").notNull().default("intro"),
    primaryContact: text("primary_contact"),
    primaryEmail: text("primary_email"),
    owner: text("owner").references(() => members.id, { onDelete: "set null" }),
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("partners_owner_idx").on(t.owner)],
);

export const documentKind = pgEnum("document_kind", [
  "contract",
  "nda",
  "invoice",
  "receipt",
  "image",
  "other",
]);

/** Index of private files in Vercel Blob. The file itself never lives in the database. */
export const documents = pgTable(
  "documents",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kind: documentKind("kind").notNull(),
    title: text("title").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    owner: text("owner").references(() => members.id, { onDelete: "set null" }),
    counterparty: text("counterparty"),
    signedOn: date("signed_on"),
    /** A project's file: its team and admins can open it. Null for a member's own documents. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("documents_owner_idx").on(t.owner), index("documents_project_idx").on(t.projectId)],
);

export const ledgerDirection = pgEnum("ledger_direction", ["in", "out"]);

/** One row per money movement. Amounts are integer cents — never floats. */
export const financeLedger = pgTable(
  "finance_ledger",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    entryDate: date("entry_date").notNull(),
    direction: ledgerDirection("direction").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    category: text("category"),
    description: text("description"),
    owner: text("owner").references(() => members.id, { onDelete: "set null" }),
    partnerId: text("partner_id").references(() => partners.id, { onDelete: "set null" }),
    receiptDocumentId: integer("receipt_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("finance_ledger_entry_date_idx").on(t.entryDate),
    index("finance_ledger_partner_idx").on(t.partnerId),
  ],
);

// ─── Approvals ───────────────────────────────────────────────────────────────

export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "approved",
  "sent",
  "rejected",
  "failed",
]);

/**
 * Every email to someone outside Novawerk waits here until a member approves it.
 * `@nw/email.send()` only accepts an approved outbox row.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Agent id that drafted it, e.g. `intake` or `sponsor-outreach`. */
    draftedBy: text("drafted_by").notNull(),
    /** What it is about, e.g. `project_submissions` + the row id. */
    relatedTable: text("related_table"),
    relatedId: text("related_id"),
    status: outboxStatus("status").notNull().default("pending"),
    approvedBy: text("approved_by").references(() => members.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Resend message id once sent. */
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_status_idx").on(t.status)],
);

// ─── Usage analytics ─────────────────────────────────────────────────────────

/**
 * Anonymous usage events. `web` rows come from the browser (POST /public/events), `api` rows
 * from the API itself (chats started and sent, agent turns, forms received). No IP, no user
 * agent, nothing a visitor typed: the event catalog is in @nw/contracts and docs/analytics.md.
 * Deleted after ANALYTICS_RETENTION_MONTHS (apps/api, privacy notice).
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    /** `web` or `api`. */
    source: text("source").notNull(),
    /** Random per page load and never stored in the browser. Null for `api` events. */
    visitId: uuid("visit_id"),
    path: text("path"),
    /** Host of an external referring site, e.g. `news.ycombinator.com`. */
    referrer: text("referrer"),
    /** `mobile` or `desktop`, read from the user agent (which is not stored). */
    device: text("device"),
    /** ISO 3166-1 country, e.g. `DE`, from Vercel's IP geolocation. The IP is not stored. */
    country: text("country"),
    /** ISO 3166-2 region, e.g. `DE-BE`. No city. */
    region: text("region"),
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_events_name_created_idx").on(t.name, t.createdAt)],
);

// ─── Row types ───────────────────────────────────────────────────────────────

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectStatusChange = typeof projectStatusChanges.$inferSelect;
export type ProjectDeliverable = typeof projectDeliverables.$inferSelect;
export type NewProjectDeliverable = typeof projectDeliverables.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type ProjectSubmission = typeof projectSubmissions.$inferSelect;
export type NewProjectSubmission = typeof projectSubmissions.$inferInsert;
export type MemberApplication = typeof memberApplications.$inferSelect;
export type NewMemberApplication = typeof memberApplications.$inferInsert;
export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type AgentTrace = typeof agentTraces.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type SignInCode = typeof signInCodes.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type FinanceEntry = typeof financeLedger.$inferSelect;
export type NewFinanceEntry = typeof financeLedger.$inferInsert;
export type OutboxEmail = typeof outbox.$inferSelect;
export type NewOutboxEmail = typeof outbox.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
