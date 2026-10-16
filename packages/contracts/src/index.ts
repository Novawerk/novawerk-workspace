// @nw/contracts — the shapes that cross the wire between apps/web, apps/admin and apps/api.
// Validate at both ends with the same schema: the browser for fast feedback, the API as the
// real gate. Keep this package dependency-light (zod only) so every app can import it.
//
// One file on purpose: it is imported as TypeScript source by Next.js (Turbopack), Vite,
// tsx, vitest and tsc with NodeNext resolution, and those disagree about relative import
// specifiers ("./x" vs "./x.js"). With no relative imports there is nothing to disagree on.
// Order matters: the form schemas come first because the intake section builds on them.

import { z } from "zod";

// ─── Shared option lists ─────────────────────────────────────────────────────

export const FUNCTION_OPTIONS = [
  { value: "pm", label: "Product / PM" },
  { value: "developer", label: "Developer" },
  { value: "design", label: "Design" },
  { value: "research", label: "Research" },
  { value: "marketing", label: "PR / Marketing" },
  { value: "operations", label: "Operations" },
  { value: "other", label: "Other" },
] as const;
export type FunctionOption = (typeof FUNCTION_OPTIONS)[number]["value"];

export const AVAILABILITY_OPTIONS = [
  { value: "lt2", label: "Under 2 hours a week" },
  { value: "2to5", label: "2–5 hours a week" },
  { value: "5to10", label: "5–10 hours a week" },
  { value: "gt10", label: "More than 10 hours a week" },
] as const;
export type AvailabilityOption = (typeof AVAILABILITY_OPTIONS)[number]["value"];

const values = <T extends readonly { value: string }[]>(opts: T) =>
  opts.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

// ─── Field helpers ───────────────────────────────────────────────────────────

const name = z.string().trim().min(1, "Please enter your name").max(100, "Keep it under 100 characters");
const email = z.string().trim().max(200).pipe(z.email("That doesn't look like a valid email"));
const longText = (label: string) =>
  z
    .string()
    .trim()
    .min(20, `${label}: a bit more detail, please (20+ characters)`)
    .max(2000, `${label}: keep it under 2000 characters`);
const optionalLinks = z.string().trim().max(500, "Keep links under 500 characters").optional().or(z.literal(""));
const mustAccept = (message: string) => z.literal(true, { error: message });
/** Honeypot: humans never see this field, bots fill it. The API answers 200 and drops it. */
const honeypot = z.string().max(0).optional().or(z.literal(""));

// ─── CVs ─────────────────────────────────────────────────────────────────────
// A visitor may attach a CV to a pitch or an application. The browser uploads it straight to the
// private file store with a ticket from POST /public/uploads/resume, then sends the ticket's
// pathname with the form. Only members can open it again, through the admin API.

export const RESUME_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const;
export type ResumeContentType = (typeof RESUME_CONTENT_TYPES)[number];
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/**
 * Where CVs live in the private store. A member handle can't start with `_`, so this never
 * meets a member's own `<id>/` prefix.
 */
export const RESUME_PREFIX = "_resumes/";
const RESUME_PATHNAME = /^_resumes\/[0-9a-f-]{36}-[a-z0-9.-]{1,80}$/;

/** An uploaded CV: where it is, and the file name the visitor picked (shown back to them and to us). */
export const resumeRef = z.object({
  pathname: z.string().max(200).regex(RESUME_PATHNAME, "That upload didn't work. Please attach your CV again."),
  name: z.string().trim().min(1).max(200),
});
export type ResumeRef = z.infer<typeof resumeRef>;

/** Optional on both forms. `null` is a CV the visitor removed again in the chat panel. */
const optionalResume = resumeRef.nullish();

// ─── Forms ───────────────────────────────────────────────────────────────────

/** novawerk.io/submit — pitch a project you want to start at Novawerk. */
export const projectSubmissionInput = z.object({
  name,
  email,
  projectName: z.string().trim().min(1, "Give it a working title").max(120),
  product: longText("Product"),
  userJourney: longText("User journey"),
  referencesAndInnovation: longText("References and what's new"),
  team: longText("Team"),
  timeline: longText("Timeline"),
  links: optionalLinks,
  resume: optionalResume,
  consent: mustAccept("Please accept the privacy note so we can contact you"),
  website: honeypot,
});
export type ProjectSubmissionInput = z.infer<typeof projectSubmissionInput>;

/** novawerk.io/join — apply to become a Member. */
export const memberApplicationInput = z.object({
  name,
  email,
  city: z.string().trim().max(100).optional().or(z.literal("")),
  functions: z.array(z.enum(values(FUNCTION_OPTIONS))).min(1, "Pick at least one"),
  background: z.string().trim().min(2, "Tell us a little about yourself").max(300),
  motivation: z
    .string()
    .trim()
    .min(20, "A bit more detail, please (20+ characters)")
    .max(2000, "Keep it under 2000 characters"),
  availability: z.enum(values(AVAILABILITY_OPTIONS), { error: "Pick one" }),
  links: optionalLinks,
  resume: optionalResume,
  consent: mustAccept("Please accept the privacy note so we can contact you"),
  website: honeypot,
});
export type MemberApplicationInput = z.infer<typeof memberApplicationInput>;

/** The newsletter box on /about. */
export const newsletterSignupInput = z.object({
  email,
  website: honeypot,
});
export type NewsletterSignupInput = z.infer<typeof newsletterSignupInput>;

/**
 * Double opt-in. A signup is pending until its address clicks the link in the confirmation
 * email; unsubscribing keeps only the marker. Issues go to `confirmed` only.
 */
export const SUBSCRIBER_STATUSES = ["pending", "confirmed", "unsubscribed"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

/** How long the link in a confirmation email works. */
export const NEWSLETTER_CONFIRM_TTL_HOURS = 72;

/** Unconfirmed signups are deleted once their link expired and they are this old (no marker kept). */
export const NEWSLETTER_PENDING_RETENTION_DAYS = 30;

/** Where the newsletter links point: the API's endpoints and the website's pages. */
export const NEWSLETTER_PATHS = {
  /**
   * API, GET shows a small page with a Confirm button (served by the API, so it never waits on a
   * web deploy); POST confirms, then redirects to `subscribed` or `linkExpired`. A GET never
   * confirms: mail scanners open links.
   */
  confirm: "/public/newsletter/confirm",
  /** API, GET redirects to the `unsubscribe` page; POST unsubscribes (RFC 8058 one-click). */
  unsubscribeApi: "/public/newsletter/unsubscribe",
  checkInbox: "/newsletter/check-inbox",
  subscribed: "/newsletter/subscribed",
  linkExpired: "/newsletter/link-expired",
  /** Web page with an Unsubscribe button; the footer link of every issue. */
  unsubscribe: "/newsletter/unsubscribe",
  unsubscribed: "/newsletter/unsubscribed",
} as const;

/** The token in a confirmation link: 32 random bytes, base64url. */
export const newsletterConfirmQuery = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Not a confirmation token"),
});

/** The token in an unsubscribe link: the subscriber's stable unsubscribe token. */
export const newsletterUnsubscribeQuery = z.object({
  token: z.uuid("Not an unsubscribe token"),
});

// ─── Public read models ──────────────────────────────────────────────────────

export const PUBLIC_PROJECT_STATUSES = ["planning", "building", "launching", "launched"] as const;
export type PublicProjectStatus = (typeof PUBLIC_PROJECT_STATUSES)[number];

/** What GET /public/projects returns for each portfolio card. */
export interface PublicProject {
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  status: PublicProjectStatus;
  year: number | null;
  link: string | null;
  coverUrl: string | null;
  featured: boolean;
  team: { name: string; role: string }[];
}

/** Every API error has this shape. `issues` maps field → messages for form errors. */
export interface ApiError {
  error: string;
  issues?: Record<string, string[]>;
}

// ─── Admin: review intake ────────────────────────────────────────────────────

/** Mirrors the `submission_status` enum in @nw/db. */
export const SUBMISSION_STATUSES = ["new", "discussing", "accepted", "declined"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Mirrors the `application_status` enum in @nw/db. */
export const APPLICATION_STATUSES = ["new", "reviewing", "accepted", "declined"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

const memberRef = z.string().trim().min(1).max(64);
const reviewNotes = z.string().trim().max(10_000, "Keep notes under 10,000 characters");
const hasChanges = (patch: Record<string, unknown>) => Object.values(patch).some((v) => v !== undefined);

/** PATCH /admin/submissions/:id. Send only what changes; `null` clears a field. */
export const submissionUpdateInput = z
  .object({
    status: z.enum(SUBMISSION_STATUSES).optional(),
    reviewerId: memberRef.nullable().optional(),
    notes: reviewNotes.nullable().optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type SubmissionUpdateInput = z.infer<typeof submissionUpdateInput>;

/** PATCH /admin/applications/:id. `memberId` links the Member created from an accepted application. */
export const applicationUpdateInput = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    reviewerId: memberRef.nullable().optional(),
    memberId: memberRef.nullable().optional(),
    notes: reviewNotes.nullable().optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateInput>;

// ═════════════════════════════════════════════════════════════════════════════
// The Intake Agent: a chat on novawerk.io/submit and /join that helps a visitor put together
// a project pitch or a member application. The agent only collects and tidies; the visitor
// reviews the draft, ticks consent and presses Send themselves (POST …/submit).
//
// Endpoints (apps/api):
//   POST  /public/intake/sessions               intakeStartInput      → 201 IntakeSession
//   GET   /public/intake/sessions/:id                                  → IntakeSession
//   POST  /public/intake/sessions/:id/messages  intakeMessageInput    → text/event-stream of IntakeEvent
//   PATCH /public/intake/sessions/:id/draft     intakeDraftPatchInput → IntakeSession  (visitor edits the panel)
//   POST  /public/intake/sessions/:id/resume    intakeResumeInput     → text/event-stream of IntakeEvent
//                                               (the visitor attached a CV: the agent reads it and fills the draft)
//   POST  /public/intake/sessions/:id/submit    intakeSubmitInput     → 201 { ok, id } | 400 ApiError
//
// The session id (uuid) is the visitor's only key to their conversation; the web app keeps it
// in localStorage so a refresh resumes the chat.

export const INTAKE_MODES = ["pitch", "join"] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

/** Everything the agent (or the visitor) has filled in so far. All optional until Send. */
export const pitchDraft = z.object({
  name: z.string().max(100),
  email: z.string().max(200),
  projectName: z.string().max(120),
  product: z.string().max(2000),
  userJourney: z.string().max(2000),
  referencesAndInnovation: z.string().max(2000),
  team: z.string().max(2000),
  timeline: z.string().max(2000),
  links: z.string().max(500),
  /** Set by the visitor's upload in the panel, never by the agent (see the update_draft tool). */
  resume: resumeRef.nullable(),
}).partial();
export type PitchDraft = z.infer<typeof pitchDraft>;

const functionValues = FUNCTION_OPTIONS.map((o) => o.value) as [string, ...string[]];
const availabilityValues = AVAILABILITY_OPTIONS.map((o) => o.value) as [string, ...string[]];

export const joinDraft = z.object({
  name: z.string().max(100),
  email: z.string().max(200),
  city: z.string().max(100),
  functions: z.array(z.enum(functionValues)).max(FUNCTION_OPTIONS.length),
  background: z.string().max(300),
  motivation: z.string().max(2000),
  availability: z.enum(availabilityValues),
  links: z.string().max(500),
  /** Set by the visitor's upload in the panel, never by the agent (see the update_draft tool). */
  resume: resumeRef.nullable(),
}).partial();
export type JoinDraft = z.infer<typeof joinDraft>;

export interface IntakeDraft {
  /** null until the visitor (or the agent, after asking) picks one. */
  mode: IntakeMode | null;
  pitch: PitchDraft;
  join: JoinDraft;
}

export const emptyIntakeDraft = (mode: IntakeMode | null = null): IntakeDraft => ({ mode, pitch: {}, join: {} });

// ─── Display ─────────────────────────────────────────────────────────────────

export type IntakeMessagePart =
  | { type: "text"; text: string }
  /** A tool the agent used, shown as a small status chip ("Updated your draft"). */
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" };

export type IntakeDisplayMessage =
  | { id: string; role: "user"; text: string; createdAt: string }
  | { id: string; role: "assistant"; parts: IntakeMessagePart[]; createdAt: string };

export interface IntakeSession {
  id: string;
  draft: IntakeDraft;
  status: "open" | "submitted";
  messages: IntakeDisplayMessage[];
  /** User turns left before the session stops accepting messages (abuse guard). */
  turnsLeft: number;
}

// ─── Streaming events (SSE `data:` lines, one JSON object each) ──────────────

export type IntakeEvent =
  | { type: "turn_start"; turnId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string }
  | { type: "tool_result"; id: string; name: string; isError: boolean }
  /** The draft changed (the agent called update_draft). Replace the panel's state with it. */
  | { type: "draft"; draft: IntakeDraft }
  | { type: "error"; message: string }
  | { type: "turn_end"; turnId: string };

// ─── Requests ────────────────────────────────────────────────────────────────

export const intakeStartInput = z.object({
  mode: z.enum(INTAKE_MODES).optional(),
  website: z.string().max(0).optional().or(z.literal("")),
});
export type IntakeStartInput = z.infer<typeof intakeStartInput>;

export const intakeMessageInput = z.object({
  text: z.string().trim().min(1, "Write something first").max(4000, "Keep a message under 4000 characters"),
});
export type IntakeMessageInput = z.infer<typeof intakeMessageInput>;

export const intakeDraftPatchInput = z.object({
  mode: z.enum(INTAKE_MODES).optional(),
  pitch: pitchDraft.optional(),
  join: joinDraft.optional(),
});
export type IntakeDraftPatchInput = z.infer<typeof intakeDraftPatchInput>;

/** The visitor's message when they attach a CV in the chat. The chat shows it as an attachment. */
export const RESUME_ATTACHED_TEXT = "I attached my CV.";

/** The visitor attached a CV in the chat (uploaded first, see POST /public/uploads/resume). */
export const intakeResumeInput = z.object({
  resume: resumeRef,
  /** Used when the chat has no mode yet. */
  mode: z.enum(INTAKE_MODES).optional(),
});
export type IntakeResumeInput = z.infer<typeof intakeResumeInput>;

export const intakeSubmitInput = z.object({
  consent: z.literal(true, { error: "Please accept the privacy note so we can contact you" }),
});
export type IntakeSubmitInput = z.infer<typeof intakeSubmitInput>;

// ─── Completeness (shared by the agent's review tool and the panel's Send button) ───

const PITCH_BLANKS = {
  name: "",
  email: "",
  projectName: "",
  product: "",
  userJourney: "",
  referencesAndInnovation: "",
  team: "",
  timeline: "",
} satisfies Required<Omit<PitchDraft, "links" | "resume">>;
const JOIN_BLANKS = { name: "", email: "", functions: [], background: "", motivation: "" } satisfies Partial<JoinDraft>;

/**
 * What's still missing or too short before this draft can be sent, as field → message.
 * Uses the same schemas as the plain forms, so the agent, the panel and the API agree.
 * Consent is the visitor's own click and is never reported here.
 */
export function intakeDraftIssues(draft: IntakeDraft): Record<string, string> {
  if (!draft.mode) return { mode: "Pick: pitch a project, or join as a Member" };
  // Absent fields count as empty, so the forms' own messages ("Please enter your name") show
  // instead of zod's generic "expected string, received undefined".
  const result =
    draft.mode === "pitch"
      ? projectSubmissionInput.omit({ consent: true, website: true }).safeParse({ ...PITCH_BLANKS, ...draft.pitch })
      : memberApplicationInput.omit({ consent: true, website: true }).safeParse({ ...JOIN_BLANKS, ...draft.join });
  if (result.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    issues[key] ??= issue.message;
  }
  return issues;
}

// ═════════════════════════════════════════════════════════════════════════════
// The admin panel (apps/admin ↔ /admin/* in apps/api). Every list here mirrors a pgEnum in
// @nw/db; apps/api/test/setup.test.ts fails if they drift.

// ─── Handles and slugs ───────────────────────────────────────────────────────

/** kebab-case: lowercase letters and digits, single hyphens. Member ids, partner ids, project slugs. */
export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const handle = (example: string, max = 40) =>
  z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(max, `Keep it under ${max} characters`)
    .regex(HANDLE_PATTERN, `Lowercase letters, digits and hyphens, e.g. ${example}`);

/**
 * Handles nobody may choose for /u/<handle>: words that are (or may become) pages, and prefixes the
 * board makes itself (`anon-` for unnamed people, `contributor-` for new email sign-ups).
 */
export const RESERVED_HANDLE_WORDS = [
  "about", "admin", "anon", "api", "app", "auth", "contrib", "contribute", "contributor", "contributors",
  "edit", "help", "imprint", "join", "login", "logout", "mcp", "me", "member", "members", "new",
  "newsletter", "novawerk", "privacy", "public", "security", "settings", "sign-in", "sign-out",
  "signin", "submit", "support", "system", "task", "tasks", "team", "tokens", "u", "www",
] as const;
export const RESERVED_HANDLE_PREFIXES = ["anon-", "contributor-"] as const;

export const isReservedHandle = (handle: string) =>
  (RESERVED_HANDLE_WORDS as readonly string[]).includes(handle) || RESERVED_HANDLE_PREFIXES.some((p) => handle.startsWith(p));

/** "Zoë Müller-Lüdenscheidt" → "zoe-muller-ludenscheidt". May return "" for text with no letters or digits. */
export function toHandle(text: string, maxLength = 40): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}

// ─── Field helpers ───────────────────────────────────────────────────────────

/** Optional free text where "" means "clear it": the API stores null. */
const nullableText = (max: number) =>
  z.string().trim().max(max, `Keep it under ${max} characters`).transform((s) => s || null).nullable();

/** A link where "" means "clear it". */
const nullableUrl = (protocol: RegExp, error: string) =>
  z
    .string()
    .trim()
    .max(2000, "Keep the link under 2000 characters")
    .transform((s) => s || null)
    .pipe(z.url({ protocol, error }).nullable())
    .nullable();

const nullableEmail = z
  .string()
  .trim()
  .max(200)
  .transform((s) => s || null)
  .pipe(z.email("That doesn't look like a valid email").nullable())
  .nullable();

const isoDate = z.iso.date({ error: "Use a date like 2026-10-03" });

// ─── Members ─────────────────────────────────────────────────────────────────

/** POST /admin/members. Everyone is a Member; `canAdmin` lets them sign in to this panel. */
export const memberCreateInput = z.object({
  id: handle("ada-lovelace"),
  displayName: z.string().trim().min(1, "Enter a name").max(100, "Keep it under 100 characters"),
  email,
  canAdmin: z.boolean().optional(),
  /** Defaults to today. */
  joinedOn: isoDate.optional(),
});
export type MemberCreateInput = z.infer<typeof memberCreateInput>;

/** PATCH /admin/members/:id. The handle and email stay fixed. */
export const memberUpdateInput = z
  .object({
    displayName: z.string().trim().min(1, "Enter a name").max(100, "Keep it under 100 characters").optional(),
    canAdmin: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type MemberUpdateInput = z.infer<typeof memberUpdateInput>;

/**
 * PATCH /admin/me: a member's own public profile (NB-ADR-0013), off by default. Switching it on
 * needs a handle (/u/<handle>, shared with contributors). Only the member sets it, never an admin.
 */
export const memberSelfUpdateInput = z
  .object({
    publicProfile: z.boolean().optional(),
    profileHandle: handle("ada-lovelace", 39).optional(),
    profileBio: nullableText(160).optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type MemberSelfUpdateInput = z.infer<typeof memberSelfUpdateInput>;

// ─── Accept flows ────────────────────────────────────────────────────────────

/**
 * POST /admin/applications/:id/accept. Creates the Member (or links the one with the
 * applicant's email) and accepts the application, in one transaction.
 */
export const applicationAcceptInput = z.object({
  /** Handle for a new Member. Defaults to one made from the applicant's name. */
  memberId: handle("ada-lovelace").optional(),
  displayName: z.string().trim().min(1, "Enter a name").max(100).optional(),
});
export type ApplicationAcceptInput = z.infer<typeof applicationAcceptInput>;

/**
 * POST /admin/submissions/:id/accept. Starts a draft project linked to the pitch (or reuses the
 * one already linked) and accepts the pitch, in one transaction.
 */
export const submissionAcceptInput = z.object({
  /** Defaults to one made from the project name. */
  slug: handle("berlin-food-map", 80).optional(),
  title: z.string().trim().min(1, "Give it a title").max(120).optional(),
  /** Queue our "we're taking it on" email to the sender (a fixed template). Default true. */
  email: z.boolean().optional(),
});
export type SubmissionAcceptInput = z.infer<typeof submissionAcceptInput>;

/** POST /admin/submissions/:id/decline. `email`: queue our short "not now" (a fixed template). Default true. */
export const submissionDeclineInput = z.object({ email: z.boolean().optional() });
export type SubmissionDeclineInput = z.infer<typeof submissionDeclineInput>;

/**
 * POST /admin/submissions/:id/invite — draft an email asking the sender for a call. The API's
 * language model writes it from the pitch (a template when there is none); nothing is queued
 * until the member sends the draft to the outbox.
 */
export const inviteDraftInput = z.object({
  /** As the sender should read them, e.g. "Wed 8 Oct, 18:00 (Berlin time)". */
  times: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "Offer at least one time")
    .max(5, "Up to 5 times"),
  minutes: z.number().int().min(15).max(120).optional(),
  /** "a video call, we send the link", or a place. */
  where: z.string().trim().max(200).optional(),
  /** Anything the member wants in it, e.g. what to bring or the question to talk about. */
  note: z.string().trim().max(1000).optional(),
});
export type InviteDraftInput = z.infer<typeof inviteDraftInput>;

/** The role the person who pitched a project gets on it. */
export const INITIATOR_ROLE = "Initiator";

// ─── Outbox ──────────────────────────────────────────────────────────────────

/** Mirrors the `outbox_status` enum in @nw/db. */
export const OUTBOX_STATUSES = ["pending", "approved", "sent", "rejected", "failed"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** What an outbox email can be about. `related_id` is that row's id. */
export const OUTBOX_RELATED_TABLES = ["project_submissions", "member_applications", "partners"] as const;
export type OutboxRelatedTable = (typeof OUTBOX_RELATED_TABLES)[number];

// The same rule as queueEmail() in @nw/email: one plain address, no display name, no lists.
const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;

const outboxTo = z
  .string()
  .trim()
  .max(200)
  .regex(SINGLE_ADDRESS, "One plain email address, e.g. ada@example.org");
const outboxSubject = z
  .string()
  .trim()
  .min(1, "Add a subject")
  .max(200, "Keep the subject under 200 characters")
  .regex(/^[^\r\n]*$/, "Keep the subject on one line");
const outboxBody = z
  .string()
  .max(20_000, "Keep the message under 20,000 characters")
  .refine((s) => s.trim().length > 0, "Write a message");

/** POST /admin/outbox — a member's draft ("Draft reply"). It waits as `pending` like any other. */
export const outboxDraftInput = z
  .object({
    to: outboxTo,
    subject: outboxSubject,
    body: outboxBody,
    relatedTable: z.enum(OUTBOX_RELATED_TABLES).optional(),
    relatedId: z.string().trim().min(1).max(100).optional(),
  })
  .refine((d) => (d.relatedTable === undefined) === (d.relatedId === undefined), {
    message: "Send relatedTable and relatedId together",
  });
export type OutboxDraftInput = z.infer<typeof outboxDraftInput>;

/** PATCH /admin/outbox/:id — edit a pending email before someone approves it. */
export const outboxUpdateInput = z
  .object({ to: outboxTo.optional(), subject: outboxSubject.optional(), body: outboxBody.optional() })
  .refine(hasChanges, { message: "Nothing to update" });
export type OutboxUpdateInput = z.infer<typeof outboxUpdateInput>;

// ─── Portfolio ───────────────────────────────────────────────────────────────

/** Mirrors the `project_status` enum in @nw/db. Only PUBLIC_PROJECT_STATUSES show on the website. */
export const PROJECT_STATUSES = ["draft", "planning", "building", "launching", "launched", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** One picture in a project's gallery. */
const galleryImage = z.object({
  url: z.string().trim().max(2000).pipe(z.url({ protocol: /^https$/, error: "Use an https:// image link" })),
  caption: z.string().trim().max(200, "Keep the caption under 200 characters").optional(),
});

const projectFields = {
  slug: handle("berlin-food-map", 80),
  title: z.string().trim().min(1, "Give it a title").max(120, "Keep it under 120 characters"),
  tagline: nullableText(160).optional(),
  /** One or two sentences for the card. */
  description: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  /** Markdown for a future detail page. */
  body: nullableText(50_000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  year: z.number().int("A whole year").min(2000, "From 2000").max(2100, "Up to 2100").nullable().optional(),
  link: nullableUrl(/^https?$/, "Use a full link, e.g. https://example.org").optional(),
  /** Uploaded to the public file store (POST /admin/uploads/image), or any https link. */
  coverUrl: nullableUrl(/^https$/, "Use an https:// image link").optional(),
  gallery: z.array(galleryImage).max(24, "Up to 24 pictures").optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  /** Launch day: planned while launching, the real day once launched. Set to today on launch if empty. */
  launchDate: isoDate.nullable().optional(),
};

/** POST /admin/projects. Leave status out for a draft. */
export const projectInput = z.object(projectFields);
export type ProjectInput = z.infer<typeof projectInput>;

/** PATCH /admin/projects/:id. */
export const projectUpdateInput = z.object(projectFields).partial().refine(hasChanges, { message: "Nothing to update" });
export type ProjectUpdateInput = z.infer<typeof projectUpdateInput>;

/** PUT /admin/projects/:id/members — the whole team, replacing what was there. */
export const projectTeamInput = z.object({
  members: z
    .array(
      z.object({
        memberId: memberRef,
        /** Free text: "Initiator", "Developer", "Design"… */
        role: z.string().trim().min(1, "Add a role").max(60, "Keep the role under 60 characters"),
      }),
    )
    .max(50)
    .refine((list) => new Set(list.map((m) => m.memberId)).size === list.length, {
      message: "Each member can appear once",
    }),
});
export type ProjectTeamInput = z.infer<typeof projectTeamInput>;

// ─── Project lifecycle ───────────────────────────────────────────────────────

/** POST /admin/projects/:id/deliverables. One artifact, one named owner, a done-when, a date. */
export const deliverableInput = z.object({
  title: z.string().trim().min(1, "Name the artifact").max(200, "Keep it under 200 characters"),
  ownerId: memberRef.nullable().optional(),
  doneWhen: nullableText(300).optional(),
  dueOn: isoDate.nullable().optional(),
  /** Null while open. */
  doneOn: isoDate.nullable().optional(),
});
export type DeliverableInput = z.infer<typeof deliverableInput>;

/** PATCH /admin/projects/:id/deliverables/:deliverableId. */
export const deliverableUpdateInput = deliverableInput.partial().refine(hasChanges, { message: "Nothing to update" });
export type DeliverableUpdateInput = z.infer<typeof deliverableUpdateInput>;

// ─── Posts ───────────────────────────────────────────────────────────────────
// The public story of Novawerk and its projects. Six kinds of post follow a project's lifecycle
// (knowledge/community/promotion): the promo agent plans and drafts them. Anything else is a
// `custom` post, with or without a project. A post has one or both language versions, goes to
// the platforms it names, and shows the template card (packages/promo/src/cards), its own
// pictures, or both. Members write posts in the admin panel or in the repo (posts/, synced on
// merge); a member approves each one, posts it by hand and marks it published.

/** Mirrors the `post_kind` enum in @nw/db: the lifecycle moments in order, then `custom`. */
export const POST_KINDS = ["kickoff", "progress", "behind_the_scenes", "launch", "ten_day", "retro", "custom"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** The kinds tied to a project's lifecycle. They need a project; the schedule plans them. */
export const LIFECYCLE_POST_KINDS = ["kickoff", "progress", "behind_the_scenes", "launch", "ten_day", "retro"] as const;
export type LifecyclePostKind = (typeof LIFECYCLE_POST_KINDS)[number];
export const isLifecycleKind = (kind: PostKind): kind is LifecyclePostKind => kind !== "custom";

/** Mirrors the `post_status` enum in @nw/db. */
export const POST_STATUSES = ["planned", "drafted", "approved", "published", "skipped"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Where posts go (the playbook's distribution table). Picks each platform's language and picture size. */
export const POST_PLATFORMS = ["xiaohongshu", "linkedin", "discord", "newsletter", "blog", "github"] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number];

/** A post has a Chinese and an English version, or one of them: parallel native texts, not translations. */
export const POST_LANGS = ["zh", "en"] as const;
export type PostLang = (typeof POST_LANGS)[number];

/** Picture sizes (knowledge/community/promotion/visual-assets.md § 4). */
export const CARD_FORMATS = {
  portrait: { width: 1242, height: 1656, label: "3:4" },
  square: { width: 1200, height: 1200, label: "1:1" },
  link: { width: 1200, height: 630, label: "1.91:1" },
  wide: { width: 1920, height: 1080, label: "16:9" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export const CARD_FORMAT_NAMES = Object.keys(CARD_FORMATS) as [CardFormat, ...CardFormat[]];

export const POST_PLATFORM_INFO: Record<
  PostPlatform,
  { label: string; langs: readonly PostLang[]; format: CardFormat; titleLimit?: number; bodyLimit: number }
> = {
  xiaohongshu: { label: "Xiaohongshu", langs: ["zh"], format: "portrait", titleLimit: 20, bodyLimit: 1000 },
  linkedin: { label: "LinkedIn", langs: ["en"], format: "square", bodyLimit: 3000 },
  discord: { label: "Discord", langs: ["zh", "en"], format: "link", bodyLimit: 2000 },
  newsletter: { label: "Newsletter", langs: ["zh", "en"], format: "link", bodyLimit: 10_000 },
  blog: { label: "Blog", langs: ["zh", "en"], format: "wide", bodyLimit: 10_000 },
  github: { label: "GitHub", langs: ["en"], format: "link", bodyLimit: 10_000 },
};

/** Each kind of post: its names and where it usually goes (the distribution table in the playbook). */
export const POST_KIND_INFO: Record<PostKind, { label: string; zh: string; platforms: readonly PostPlatform[] }> = {
  kickoff: { label: "Kickoff", zh: "立项卡", platforms: ["xiaohongshu", "linkedin", "discord", "github"] },
  progress: { label: "Progress", zh: "进展帖", platforms: ["xiaohongshu", "discord", "newsletter", "github"] },
  behind_the_scenes: {
    label: "Behind the scenes",
    zh: "制作幕后",
    platforms: ["xiaohongshu", "linkedin", "discord", "blog"],
  },
  launch: {
    label: "Launch",
    zh: "上线卡",
    platforms: ["xiaohongshu", "linkedin", "discord", "newsletter", "blog", "github"],
  },
  ten_day: { label: "Ten days in", zh: "十天反馈", platforms: ["xiaohongshu", "discord", "newsletter"] },
  retro: { label: "Retrospective", zh: "阶段回顾", platforms: ["xiaohongshu", "linkedin", "discord", "newsletter", "blog"] },
  custom: { label: "Custom", zh: "自由帖", platforms: ["xiaohongshu", "linkedin", "discord"] },
};

/** "Progress · week 4", "Retrospective · day 90", "Launch", and a custom post's own name. */
export function postLabel(kind: PostKind, seq: number, label?: string | null): string {
  if (kind === "custom") return label?.trim() || POST_KIND_INFO.custom.label;
  const name = POST_KIND_INFO[kind].label;
  if (kind === "progress" && seq > 0) return `${name} · week ${seq}`;
  if (kind === "retro" && seq > 0) return `${name} · day ${seq}`;
  return name;
}

/**
 * Where a post goes: the ones it names, else its kind's usual ones; only those that read one of
 * its languages.
 */
export function postPlatforms(post: {
  kind: PostKind;
  platforms: readonly string[] | null;
  langs: readonly PostLang[];
}): PostPlatform[] {
  const chosen = post.platforms ?? POST_KIND_INFO[post.kind].platforms;
  return POST_PLATFORMS.filter(
    (p) => chosen.includes(p) && POST_PLATFORM_INFO[p].langs.some((lang) => post.langs.includes(lang)),
  );
}

const cardText = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

/** What goes on the picture. Empty fields are left out of the card. */
export const postCard = z.object({
  /** Small line above the headline, e.g. "Novawerk 又有人许愿了". */
  eyebrow: cardText(60),
  headline: cardText(120),
  lede: cardText(280),
  points: z.array(cardText(140)).max(5, "Up to 5 lines"),
  quote: z.object({ text: cardText(300), by: cardText(80) }),
  stats: z.array(z.object({ value: cardText(16), label: cardText(60) })).max(4, "Up to 4 numbers"),
  footer: cardText(120),
});
export type PostCardInput = z.infer<typeof postCard>;

export const emptyPostCard = (): PostCardInput => ({
  eyebrow: "",
  headline: "",
  lede: "",
  points: [],
  quote: { text: "", by: "" },
  stats: [],
  footer: "",
});

/** One language version: a title (Xiaohongshu allows 20 characters), the text, the picture. */
export const postCopy = z.object({
  title: z.string().trim().max(120, "Keep the title under 120 characters"),
  body: z.string().max(10_000, "Keep the text under 10,000 characters"),
  card: postCard,
});
export type PostCopyInput = z.infer<typeof postCopy>;

export const emptyPostCopy = (): PostCopyInput => ({ title: "", body: "", card: emptyPostCard() });

/** Both versions; a post in one language leaves the other empty. */
export const postContent = z.object({ zh: postCopy, en: postCopy });
export type PostContentInput = z.infer<typeof postContent>;

/**
 * Gaps the writer leaves for a member: 【待补充：一条真实反馈】 in Chinese, [To fill in: a real
 * quote] in English. A post with any of them left can't be approved.
 */
export const PLACEHOLDER_PATTERN = /【待补充[^】]*】|\[To fill in[^\]]*\]/gi;

/** Every line of text in one version, in reading order: title, text, then the card. */
function copyTexts({ title, body, card }: PostCopyInput): string[] {
  return [
    title,
    body,
    card.eyebrow,
    card.headline,
    card.lede,
    ...card.points,
    card.quote.text,
    card.quote.by,
    ...card.stats.flatMap((s) => [s.value, s.label]),
    card.footer,
  ];
}

/** Every placeholder still in a post (in the languages it has), in reading order. */
export function placeholdersIn(content: PostContentInput, langs: readonly PostLang[] = POST_LANGS): string[] {
  const texts = POST_LANGS.filter((lang) => langs.includes(lang)).flatMap((lang) => copyTexts(content[lang]));
  return texts.flatMap((t) => t.match(PLACEHOLDER_PATTERN) ?? []);
}

/**
 * A web address or an email: "https://…", "novawerk.io/portfolio/yima", "info@novawerk.io".
 * Xiaohongshu throttles a note that shows one or sends people off the platform (videos/BRAND.md,
 * "小红书：不露网址，不引导"), so the Chinese version of a post that goes there carries none.
 */
export const LINK_PATTERN =
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/[^\s，。；、！？）)」】]+|\b(?:[a-z0-9-]+\.)+(?:io|com|org|net|de|eu|cn|dev|app|me|co|ai|gg|so|ly|xyz|link)\b(?:\/[^\s，。；、！？）)」】]*)?/gi;

/** Every web address and email in one version, in reading order. */
export function linksIn(copy: PostCopyInput): string[] {
  return copyTexts(copy).flatMap((t) => t.match(LINK_PATTERN) ?? []);
}

/** The links in the Chinese version of a post that goes to Xiaohongshu; it can't go out with any. */
export function xiaohongshuLinks(
  post: { kind: PostKind; platforms: readonly string[] | null; langs: readonly PostLang[] },
  content: PostContentInput,
): string[] {
  return postPlatforms(post).includes("xiaohongshu") ? linksIn(content.zh) : [];
}

/** The languages a post has that still have neither a title nor a text. */
export function emptyLangs(content: PostContentInput | null, langs: readonly PostLang[]): PostLang[] {
  return langs.filter((lang) => !content || (!content[lang].title.trim() && !content[lang].body.trim()));
}

/** https, or http on this machine (posts from the repo in local development, served by the API). */
const isPictureLink = (url: string) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1"));
  } catch {
    return false;
  }
};
const pictureLink = z.string().trim().max(2000, "Keep the link under 2000 characters").refine(isPictureLink, "Use an https:// image link");
const photoUrl = pictureLink.or(z.literal("").transform(() => null)).nullable();

/** A post's languages: one or both, each once, in the usual order. */
export const postLangs = z
  .array(z.enum(POST_LANGS))
  .min(1, "Pick at least one language")
  .transform((langs) => POST_LANGS.filter((l) => langs.includes(l)));

/** Where a post goes; null means its kind's usual platforms. */
export const postPlatformList = z
  .array(z.enum(POST_PLATFORMS))
  .min(1, "Pick at least one platform")
  .transform((list) => POST_PLATFORMS.filter((p) => list.includes(p)))
  .nullable();

/** One of a post's own pictures. Uploaded (POST /admin/uploads/image) or any https link. */
export const postImage = z.object({
  url: pictureLink,
  alt: z.string().trim().max(300, "Keep it under 300 characters").optional(),
  lang: z.enum(POST_LANGS).optional(),
});
export type PostImageInput = z.infer<typeof postImage>;

/** Xiaohongshu takes up to 18 pictures in a post. */
export const MAX_POST_IMAGES = 18;
export const postImages = z.array(postImage).max(MAX_POST_IMAGES, `Up to ${MAX_POST_IMAGES} pictures`);

const postLabelText = z.string().trim().min(1, "Name the post").max(80, "Keep the name under 80 characters");

/**
 * POST /admin/posts — a post a member adds by hand. A lifecycle kind needs a project; a custom
 * one needs a name and may leave the project out (a post about Novawerk itself).
 */
export const postCreateInput = z
  .object({
    projectId: z.guid().nullable().optional(),
    kind: z.enum(POST_KINDS),
    label: postLabelText.optional(),
    /** Defaults to today. */
    dueOn: isoDate.optional(),
    langs: postLangs.optional(),
    platforms: postPlatformList.optional(),
    withCard: z.boolean().optional(),
    /** Ask the promo agent for a draft right away. Default true. */
    draft: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "custom" && !input.label) {
      ctx.addIssue({ code: "custom", path: ["label"], message: "Name the post" });
    }
    if (input.kind !== "custom" && !input.projectId) {
      ctx.addIssue({ code: "custom", path: ["projectId"], message: "A lifecycle post belongs to a project" });
    }
  });
export type PostCreateInput = z.input<typeof postCreateInput>;

/** POST /admin/projects/:id/posts — the same, for one project (the project page's menu). */
export const projectPostCreateInput = z.object({
  kind: z.enum(POST_KINDS),
  label: postLabelText.optional(),
  dueOn: isoDate.optional(),
});
export type ProjectPostCreateInput = z.infer<typeof projectPostCreateInput>;

/**
 * PATCH /admin/posts/:id. Editing the content of an approved post sends it back to review.
 * Posts written in the repo change only there.
 */
export const postUpdateInput = z
  .object({
    label: postLabelText.optional(),
    brief: nullableText(4000).optional(),
    photoUrl: photoUrl.optional(),
    dueOn: isoDate.optional(),
    langs: postLangs.optional(),
    platforms: postPlatformList.optional(),
    withCard: z.boolean().optional(),
    images: postImages.optional(),
    content: postContent.optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type PostUpdateInput = z.input<typeof postUpdateInput>;

/** POST /admin/cards — render one picture (PNG). Stateless: the editor sends what it shows. */
export const cardRenderInput = z.object({
  kind: z.enum(POST_KINDS),
  lang: z.enum(POST_LANGS),
  format: z.enum(CARD_FORMAT_NAMES),
  card: postCard,
  /** One of a project's own pictures (cover or gallery), or one of a post's. */
  photoUrl: photoUrl.optional(),
  /** Show where a photo goes, without one (the template previews). Ignored with `photoUrl`. */
  samplePhoto: z.boolean().optional(),
});
export type CardRenderInput = z.infer<typeof cardRenderInput>;

// ─── Post templates ──────────────────────────────────────────────────────────
// What each kind of post is for, when it goes out, the fields its text carries
// (knowledge/community/promotion/post-templates.md), its card, and an example in both languages.
// The admin panel shows them (Posts → Templates); `pnpm post new` starts a post from them.

/**
 * The card each kind of post gets (packages/promo/src/cards/templates.ts), by its code: black,
 * squeezed serif type, a HUD in green, after Evangelion's title cards (NB-ADR-0009).
 */
export const CARD_DESIGNS: Record<PostKind, { label: string; detail: string }> = {
  kickoff: { label: "EPISODE:01", detail: "The project's name as a title card, the wish, a spec readout" },
  progress: { label: "PHASE:NN", detail: "The week as a big number, the small story, a DONE / NEXT log" },
  behind_the_scenes: { label: "T-10 // MAKING OF", detail: "The project's own picture in a viewfinder, the trade-off, the staff" },
  launch: { label: "T-0 // LAUNCH", detail: "Status: online. The name huge, what it does as tags, a photo or hazard stripes" },
  ten_day: { label: "T+10 // REPORT", detail: "One real quote as a subtitle, the numbers as readouts" },
  retro: { label: "T+NN // REPORT", detail: "One hero readout, the rest in a grid, what's next" },
  custom: { label: "NOTICE", detail: "A title card and the details in a ruled box, a photo if there is one" },
};

type Both<T> = { zh: T; en: T };

export interface PostTemplate {
  kind: PostKind;
  /** What it is for, in one line. */
  purpose: Both<string>;
  /** When it goes out. */
  when: Both<string>;
  /** What the text carries, in order. `pnpm post new` turns them into placeholders. */
  fields: Both<string[]>;
  /** The small line on the card, to start from. */
  eyebrow: Both<string>;
  /** Shows best with one of the project's pictures. */
  photo: boolean;
  /** An example, to show the card and the tone. Not real facts. */
  example: Both<PostCopyInput>;
}

const card = (c: Partial<PostCardInput>): PostCardInput => ({ ...emptyPostCard(), ...c });

export const POST_TEMPLATES: Record<PostKind, PostTemplate> = {
  kickoff: {
    kind: "kickoff",
    purpose: { zh: "宣布愿望，公开招募 Builder", en: "Announce the wish and recruit builders" },
    when: { zh: "项目进入 Building 时", en: "When the project starts building" },
    fields: {
      zh: ["愿望是什么，为什么有意思", "许愿人：名字和一句话身份", "首个交付：产物 · 责任人 · 完成标志 · 截止日", "招募：需要的角色和技能", "怎么加入", "一句 Novawerk 是什么"],
      en: ["The wish and why it matters", "Wished by: name and one line about them", "First deliverable: artifact · owner · done when · date", "Who we are looking for", "How to join", "One line on what Novawerk is"],
    },
    eyebrow: { zh: "又有人许愿了", en: "Someone wished for it" },
    photo: false,
    example: {
      zh: {
        title: "又有人许愿了：柏林中餐地图",
        body: "在柏林想吃口靠谱的中餐，每次都要在朋友圈问一圈。有没有一份由真实吃过的人维护的地图？\n\n许愿人：Min Z.（在柏林住了 6 年）\n\n首个交付：20 家店的种子清单 · Yu · 在 Notion 上公开 · 5 月 30 日\n\n招募：1 位写过 Next.js 的 Builder，2–3 位住在柏林的 Supporter。\n\n想加入，就在评论区说说你能做什么。\n\n——\nNovawerk 是一个非营利社区，我们一起把愿望做成真的东西。",
        card: card({
          eyebrow: "又有人许愿了",
          headline: "柏林中餐地图",
          lede: "一份由真实吃过的人维护的柏林中餐地图。",
          points: ["首个交付：20 家店的种子清单 · Yu", "招募：1 位 Builder，2–3 位 Supporter"],
          footer: "许愿人 Min Z.",
        }),
      },
      en: {
        title: "Someone wished for it: Berlin Chinese Food Map",
        body: "Finding decent Chinese food in Berlin shouldn't take a group chat every weekend. We are building a map kept by the people who eat there.\n\nWished by: Min Z. (six years in Berlin)\n\nFirst deliverable: a seed list of 20 places · Yu · public on Notion · 30 May\n\nWe are looking for one builder who has shipped Next.js, and two or three people in Berlin who write honest two-liners.\n\nJoin us: info@novawerk.io or Discord.",
        card: card({
          eyebrow: "Someone wished for it",
          headline: "Berlin Chinese Food Map",
          lede: "A map of Chinese restaurants in Berlin, kept by the people who eat there.",
          points: ["First deliverable: 20 places · Yu", "Looking for a builder who has shipped Next.js"],
          footer: "Wished by Min Z.",
        }),
      },
    },
  },
  progress: {
    kind: "progress",
    purpose: { zh: "公开进展，让没参与的人也能跟上", en: "Keep the work open to people who aren't in it" },
    when: { zh: "Building 期间每 2 周", en: "Every two weeks while building" },
    fields: {
      zh: ["完成了哪个交付，谁交付的", "新加入的人", "一个小困难或小决定", "下一个交付：产物 · 责任人 · 截止日"],
      en: ["What got done, and by whom", "Who joined", "One small difficulty or decision", "Next deliverable: artifact · owner · date"],
    },
    eyebrow: { zh: "第 N 周进展", en: "Week N" },
    photo: false,
    example: {
      zh: {
        title: "柏林中餐地图 · 第 3 周",
        body: "完成：\n· 20 家店种子清单上线（Yu）\n· 地图前端原型跑通（Jiawei）\n\n新加入：欢迎 Lin，之后负责内容审核。\n\n这周的小困难：20 家变成 60 家后，「什么算靠谱」开始有分歧。我们决定不合并，做两个 tag，让大家自己挑。\n\n下一个交付：评价 tag 系统 · Lin · 6 月 13 日",
        card: card({
          eyebrow: "第 3 周进展",
          headline: "柏林中餐地图",
          lede: "「靠谱」有两种：我们做成了两个 tag。",
          points: ["完成：种子清单 · Yu", "完成：地图原型 · Jiawei", "下一个：评价 tag · Lin"],
        }),
      },
      en: {
        title: "Berlin Chinese Food Map, week 3",
        body: "Done: the seed list of 20 places (Yu) and a working map prototype (Jiawei).\nJoined: Lin, who reviews the notes.\n\nAt 60 places we disagreed on what \"decent\" means, so we made it two tags.\n\nNext: the tag system (Lin, 13 June).",
        card: card({
          eyebrow: "Week 3",
          headline: "Berlin Chinese Food Map",
          lede: "\"Decent\" means two things, so we made two tags.",
          points: ["Done: seed list · Yu", "Done: map prototype · Jiawei", "Next: tags · Lin"],
        }),
      },
    },
  },
  behind_the_scenes: {
    kind: "behind_the_scenes",
    purpose: { zh: "给上线预热，让团队变成具体的人", en: "Warm up for the launch; make the team into people" },
    when: { zh: "上线前 10 天（Launching）", en: "Ten days before launch" },
    fields: {
      zh: ["2–3 张过程素材：截图、录屏、手稿", "一个取舍故事：差点做了 X，后来选了 Y", "制作团队：2–4 人，每人一句", "上线日期"],
      en: ["2–3 pictures from the work: screenshots, sketches", "One trade-off: we almost did X, chose Y", "The team: 2–4 people, one line each", "The launch date"],
    },
    eyebrow: { zh: "上线之前", en: "Before launch" },
    photo: true,
    example: {
      zh: {
        title: "Quiet Desk 上线之前",
        body: "我们差点接实时人流数据，后来选了大家自己写的备注：更真实，也不用追踪任何人。\n\n制作团队：\n· 设计 —— Aiko\n· 工程 —— Haodong\n· 许愿人 —— Jonas\n\n10 月 12 日上线。",
        card: card({
          eyebrow: "上线之前",
          headline: "Quiet Desk",
          lede: "没用实时人流数据，选了大家自己写的备注。",
          points: ["设计 —— Aiko", "工程 —— Haodong", "许愿人 —— Jonas"],
          footer: "10 月 12 日上线",
        }),
      },
      en: {
        title: "Before Quiet Desk launches",
        body: "We almost used live occupancy data. We chose people's own notes instead: more honest, and nobody gets tracked.\n\nBuilt by Aiko (design), Haodong (engineering) and Jonas, who wished for it.\n\nIt launches on 12 October.",
        card: card({
          eyebrow: "Before launch",
          headline: "Quiet Desk",
          lede: "No live tracking. People's own notes instead.",
          points: ["Design — Aiko", "Engineering — Haodong", "Wished by — Jonas"],
          footer: "Launches 12 October",
        }),
      },
    },
  },
  launch: {
    kind: "launch",
    purpose: { zh: "告诉世界这件事做成了，宣发的高峰", en: "Tell the world it is done and working; the most important post" },
    when: { zh: "上线当天（T）", en: "On launch day (T)" },
    fields: {
      zh: ["项目名和一句话定位", "它为人做了什么（用户视角，不是功能列表）", "愿望和许愿人", "制作团队", "一句 Novawerk 是什么", "下一个就是你：在评论区说说你的愿望", "在哪儿能找到它：名字或搜什么（小红书不放网址）"],
      en: ["The name and one line on what it is", "What it does for people (not a feature list)", "The wish and who wished it", "The team", "One line on what Novawerk is", "You could be next: novawerk.io/submit", "The link"],
    },
    eyebrow: { zh: "新项目上线", en: "Just launched" },
    photo: true,
    example: {
      zh: {
        title: "Novawerk 新项目上线 · YIMA",
        body: "一个把利润排除在外的经期日历。\n\n许愿来自一位用了五年付费 app 的人：「有一天发现它把我的数据卖了。我想要一个不这么做的。」\n\nYIMA 做了什么：\n· 经期和排卵预测\n· 数据只留在你的手机里\n· 没有广告、没有付费墙\n· 开源、可以检查\n\n——\nNovawerk 是柏林的一个非营利开放工作坊。下一个也许就是你的愿望，在评论区说说。",
        card: card({
          eyebrow: "新项目上线",
          headline: "YIMA",
          lede: "一个把利润排除在外的经期日历。",
          points: ["数据只留在你的手机里", "没有广告、没有付费墙", "开源、可以检查"],
          footer: "",
        }),
      },
      en: {
        title: "New from Novawerk: YIMA",
        body: "A period calendar designed without profit as a constraint.\n\nThe wish came from someone who used a paid app for five years: \"One day I found out they were selling my data. I wanted one that doesn't.\"\n\nYIMA predicts periods and ovulation, keeps every bit of data on your phone, has no ads and no paywall, and is open source.\n\nTry it: novawerk.io\n\nYou could be next: novawerk.io/submit",
        card: card({
          eyebrow: "Just launched",
          headline: "YIMA",
          lede: "A period calendar designed without profit as a constraint.",
          points: ["Your data stays on your phone", "No ads, no paywall", "Open source"],
          footer: "novawerk.io",
        }),
      },
    },
  },
  ten_day: {
    kind: "ten_day",
    purpose: { zh: "表明它还在被改进，不是发完就走", en: "Show it is still being improved" },
    when: { zh: "上线后第 10 天（T+10）", en: "Ten days after launch (T+10)" },
    fields: {
      zh: ["真实数字：用户、下载、星标、贡献者", "3–5 条真实反馈", "已经改了什么", "准备改什么", "一个意外发现"],
      en: ["Real numbers: users, downloads, stars, contributors", "3–5 real pieces of feedback", "What we already changed", "What we will change", "One surprise"],
    },
    eyebrow: { zh: "上线十天", en: "Ten days in" },
    photo: false,
    example: {
      zh: {
        title: "YIMA 上线十天",
        body: "上线十天，120 次下载，GitHub 上 14 颗星。\n\n我们听到的：「终于有一个不卖我数据的。」\n\n已经改了：提醒的 bug（第 3 天）。\n准备改：导出数据。\n\n意外发现：很多人把它推荐给了妈妈。",
        card: card({
          eyebrow: "上线十天",
          headline: "YIMA",
          lede: "第 3 天修好了提醒。",
          quote: { text: "终于有一个\n不卖我数据的。", by: "一位小红书用户" },
          stats: [{ value: "120", label: "次下载" }, { value: "14", label: "GitHub 星标" }],
        }),
      },
      en: {
        title: "YIMA, ten days in",
        body: "Ten days in: 120 downloads, 14 stars on GitHub.\n\nWhat we heard: \"Finally one that doesn't sell my data.\"\n\nAlready changed: the reminder bug (day 3). Next: exporting your data.",
        card: card({
          eyebrow: "Ten days in",
          headline: "YIMA",
          lede: "We fixed reminders on day 3.",
          quote: { text: "Finally one that doesn't sell my data.", by: "A user on Xiaohongshu" },
          stats: [{ value: "120", label: "downloads" }, { value: "14", label: "GitHub stars" }],
        }),
      },
    },
  },
  retro: {
    kind: "retro",
    purpose: { zh: "数字、人、下一步", en: "Numbers, people, what's next" },
    when: { zh: "上线后 30 天和 90 天", en: "30 and 90 days after launch" },
    fields: {
      zh: ["3–5 个关键数字", "一位用户或共建者的短访谈（3–5 问）", "下一阶段的交付", "致谢", "一句「还在被改进」"],
      en: ["3–5 key numbers", "A short interview with a user or builder (3–5 questions)", "The next deliverables", "Thanks", "One line that it is still being improved"],
    },
    eyebrow: { zh: "上线 N 天", en: "Day N" },
    photo: false,
    example: {
      zh: {
        title: "YIMA 三个月：数字、人、下一步",
        body: "三个月，1,240 位用户，9 位贡献者，0 条数据被上传。\n\n我们问了一位用户为什么留下来：「它不打扰我。」\n\n下一步：多语言、导出数据。\n\n谢谢每一位提 issue 的人。它还在被改进。",
        card: card({
          eyebrow: "上线 90 天",
          headline: "YIMA",
          lede: "下一步：多语言和数据导出。",
          stats: [{ value: "1,240", label: "位用户" }, { value: "9", label: "位贡献者" }, { value: "0", label: "条数据被上传" }],
        }),
      },
      en: {
        title: "YIMA at three months",
        body: "Three months: 1,240 users, 9 contributors, 0 bytes uploaded.\n\nWe asked a user why she stayed: \"It leaves me alone.\"\n\nNext: more languages and data export.\n\nThank you to everyone who filed an issue. It is still being improved.",
        card: card({
          eyebrow: "Day 90",
          headline: "YIMA",
          lede: "Next: more languages and data export.",
          stats: [{ value: "1,240", label: "users" }, { value: "9", label: "contributors" }, { value: "0", label: "bytes uploaded" }],
        }),
      },
    },
  },
  custom: {
    kind: "custom",
    purpose: { zh: "六个节点之外的任何帖子：活动、招募、感谢、月报……", en: "Anything else: an event, a call for builders, a thank-you, a round-up" },
    when: { zh: "你定", en: "Whenever it fits" },
    fields: {
      zh: ["一句话说清是什么", "具体信息：时间、地点、谁、怎么参加", "为什么值得来 / 值得看", "下一步怎么做（不放链接：留言、直接来）"],
      en: ["What it is, in one line", "The details: when, where, who, how to join", "Why it is worth it", "What to do next (a link)"],
    },
    eyebrow: { zh: "", en: "" },
    photo: false,
    example: {
      zh: {
        title: "来工作坊坐坐：10 月开放日",
        body: "10 月 18 日下午，我们开放工作坊。\n\n看看我们正在做的三个项目，和做它们的人聊聊。也可以带上一个你一直想做的东西——我们叫它“愿望”。\n\n不用报名，直接来。\n\n📍 Kreuzberg\n🕑 14:00–18:00",
        card: card({
          eyebrow: "开放日",
          headline: "来工作坊坐坐",
          lede: "看看我们正在做的东西，带上你的愿望。",
          points: ["10 月 18 日 14:00–18:00", "Kreuzberg", "不用报名，直接来"],
          footer: "",
        }),
      },
      en: {
        title: "Open day at the workshop",
        body: "On Saturday 18 October we open the workshop.\n\nSee the three projects we are building and meet the people who build them. Bring something you have always wanted to exist: we call it a wish.\n\nNo sign-up. Kreuzberg, 14:00–18:00.",
        card: card({
          eyebrow: "Open day",
          headline: "Come by the workshop",
          lede: "See what we are building, and bring a wish.",
          points: ["18 October, 14:00–18:00", "Kreuzberg", "No sign-up needed"],
          footer: "novawerk.io",
        }),
      },
    },
  },
};

/** Placeholders for a fresh post: one line per field of its template. */
export function templatePlaceholders(kind: PostKind, lang: PostLang): string {
  const gap = lang === "zh" ? (f: string) => `【待补充：${f}】` : (f: string) => `[To fill in: ${f}]`;
  return POST_TEMPLATES[kind].fields[lang].map(gap).join("\n\n");
}

// ─── Partners ────────────────────────────────────────────────────────────────

/** Mirrors the `partner_stage` enum in @nw/db, in pipeline order. */
export const PARTNER_STAGES = ["intro", "follow-up", "grant-ask", "renewal", "closed"] as const;
export type PartnerStage = (typeof PARTNER_STAGES)[number];

const partnerFields = {
  /** Matches records/partners/<id>.md. */
  id: handle("acme-foundation", 80),
  name: z.string().trim().min(1, "Enter a name").max(160, "Keep it under 160 characters"),
  stage: z.enum(PARTNER_STAGES).optional(),
  primaryContact: nullableText(120).optional(),
  primaryEmail: nullableEmail.optional(),
  /** Member id of whoever looks after this partner. */
  owner: memberRef.nullable().optional(),
  lastTouchAt: z.iso.datetime({ offset: true, error: "Use an ISO date and time" }).nullable().optional(),
};

/** POST /admin/partners. */
export const partnerInput = z.object(partnerFields);
export type PartnerInput = z.infer<typeof partnerInput>;

/** PATCH /admin/partners/:id. The id stays fixed (records/ link to it). */
export const partnerUpdateInput = z
  .object(partnerFields)
  .omit({ id: true })
  .partial()
  .refine(hasChanges, { message: "Nothing to update" });
export type PartnerUpdateInput = z.infer<typeof partnerUpdateInput>;

// ─── Finance ─────────────────────────────────────────────────────────────────

/** Mirrors the `ledger_direction` enum in @nw/db. */
export const LEDGER_DIRECTIONS = ["in", "out"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/** We keep the books in euro. */
export const LEDGER_CURRENCY = "EUR";

/** Largest amount one entry may carry: €10 million, in cents. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/**
 * POST /admin/finance — one money movement. Amounts are positive integer cents; `direction`
 * says which way. The ledger is append-only: fix a mistake with a correcting entry.
 */
export const financeEntryInput = z.object({
  entryDate: isoDate,
  direction: z.enum(LEDGER_DIRECTIONS, { error: "In or out?" }),
  amountCents: z
    .number()
    .int("Whole cents only")
    .positive("Enter an amount above zero")
    .max(MAX_AMOUNT_CENTS, "That is more than €10 million"),
  currency: z.literal(LEDGER_CURRENCY).optional(),
  category: nullableText(60).optional(),
  description: nullableText(500).optional(),
  partnerId: z.string().trim().min(1).max(80).nullable().optional(),
  receiptDocumentId: z.number().int().positive().nullable().optional(),
});
export type FinanceEntryInput = z.infer<typeof financeEntryInput>;

/**
 * "12", "12.5", "12,50", "1 234.56", "€1,234.56" → integer cents. Null when it isn't a plain
 * positive amount with at most two decimals. String arithmetic only: no floats.
 */
export function parseAmountToCents(text: string): number | null {
  const cleaned = text.trim().replace(/^€\s*|\s*(€|eur)$/gi, "").replace(/[\s ']/g, "");
  // 1,234.56 / 1.234,56 / 1234,5 / 1234. Thousands groups use one separator throughout, and
  // "1,234" alone is a thousands group (three digits after the mark), never a decimal.
  const match = /^(\d{1,3}(?:([.,])\d{3}(?:\2\d{3})*)?|\d+)(?:([.,])(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole = "", groupSep, decimalSep, fraction = ""] = match;
  if (groupSep && decimalSep && groupSep === decimalSep) return null;
  const euros = Number(whole.replace(/[.,]/g, ""));
  const cents = euros * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

// ─── Documents ───────────────────────────────────────────────────────────────

/** Mirrors the `document_kind` enum in @nw/db. */
export const DOCUMENT_KINDS = ["contract", "nda", "invoice", "receipt", "image", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

// ─── Uploads ─────────────────────────────────────────────────────────────────
// Files go straight from the browser to Vercel Blob with a short-lived token from the API, never
// through our functions. Project images land in the public store (served by Vercel's CDN);
// documents in the private one (every read goes through the API, which checks who asks).

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
export const DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const filename = z.string().trim().min(1, "The file needs a name").max(200, "Keep the file name under 200 characters");

/** POST /admin/uploads/image — ask for a token to upload one project picture. */
export const imageUploadInput = z.object({
  filename,
  contentType: z.enum(IMAGE_CONTENT_TYPES, { error: "Use a JPEG, PNG, WebP, GIF or AVIF image" }),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, "Images can be up to 10 MB"),
});
export type ImageUploadInput = z.infer<typeof imageUploadInput>;

/** POST /admin/documents/upload — ask for a token to upload one private document. */
export const documentUploadInput = z.object({
  filename,
  contentType: z.enum(DOCUMENT_CONTENT_TYPES, { error: "Use a PDF, an image, or a Word or Excel file" }),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, "Documents can be up to 25 MB"),
});
export type DocumentUploadInput = z.infer<typeof documentUploadInput>;

/** POST /public/uploads/resume — ask for a token to upload one CV for a pitch or an application. */
export const resumeUploadInput = z.object({
  filename,
  contentType: z.enum(RESUME_CONTENT_TYPES, { error: "Use a PDF or a Word file" }),
  size: z.number().int().positive().max(MAX_RESUME_BYTES, "A CV can be up to 5 MB"),
});
export type ResumeUploadInput = z.infer<typeof resumeUploadInput>;

/** What POST /public/uploads/resume answers: a short-lived token for exactly one pathname. */
export interface ResumeUploadTicket {
  token: string;
  pathname: string;
}

/** POST /admin/documents — record a document after its file is uploaded. */
export const documentCreateInput = z.object({
  /** The pathname from the upload ticket. */
  pathname: z.string().trim().min(1).max(300),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().min(1, "Give it a title").max(200, "Keep the title under 200 characters"),
  counterparty: nullableText(160).optional(),
  signedOn: isoDate.nullable().optional(),
});
export type DocumentCreateInput = z.infer<typeof documentCreateInput>;

/** What a project's files may be: documents, plus slides, plain text, Markdown, GIFs and zips. */
export const PROJECT_FILE_CONTENT_TYPES = [
  ...DOCUMENT_CONTENT_TYPES,
  "image/gif",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "application/zip",
] as const;

/** POST /admin/projects/:id/files/upload — a ticket to upload one file of the project. */
export const projectFileUploadInput = z.object({
  filename,
  contentType: z.enum(PROJECT_FILE_CONTENT_TYPES, {
    error: "Use a PDF, an image, a Word, Excel or PowerPoint file, text, Markdown or a zip",
  }),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, "Files can be up to 25 MB"),
});
export type ProjectFileUploadInput = z.infer<typeof projectFileUploadInput>;

/** POST /admin/projects/:id/files — record a project file after it is uploaded. */
export const projectFileCreateInput = z.object({
  /** The pathname from the upload ticket. */
  pathname: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1, "Give it a title").max(200, "Keep the title under 200 characters"),
});
export type ProjectFileCreateInput = z.infer<typeof projectFileCreateInput>;

// ─── Intake transcripts ──────────────────────────────────────────────────────

/** One bubble of the Intake Agent conversation that produced a pitch or application. Text only. */
export interface IntakeTranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

/** GET /admin/submissions/:id/transcript and /admin/applications/:id/transcript. */
export interface IntakeTranscript {
  sessionId: string;
  startedAt: string;
  messages: IntakeTranscriptMessage[];
}

// ─── Admin assistant (/admin/chat) ───────────────────────────────────────────
// A member's chat with an assistant that reads the inbox, members and partners, and can draft
// an email into the outbox (pending, like any draft). It never sends and never changes records.
//
//   POST /admin/chat/sessions               → 201 AdminChatSession
//   GET  /admin/chat/sessions/:id           → AdminChatSession (only the owner's)
//   POST /admin/chat/sessions/:id/messages  adminChatMessageInput → text/event-stream of AdminChatEvent

/** What the chat is about, when it opens next to a pitch or an application. */
export const ADMIN_CHAT_SUBJECT_KINDS = ["submission", "application"] as const;
export type AdminChatSubjectKind = (typeof ADMIN_CHAT_SUBJECT_KINDS)[number];

export const adminChatMessageInput = z.object({
  text: z.string().trim().min(1, "Write something first").max(4000, "Keep a message under 4000 characters"),
  subject: z.object({ kind: z.enum(ADMIN_CHAT_SUBJECT_KINDS), id: z.guid() }).optional(),
});
export type AdminChatMessageInput = z.infer<typeof adminChatMessageInput>;

export type AdminChatPart =
  | { type: "text"; text: string }
  /** A tool the assistant used, with what it asked for and (shortened) what came back. */
  | { type: "tool"; id: string; name: string; input: unknown; output?: string; status: "running" | "done" | "error" };

export type AdminChatMessage =
  | { id: string; role: "user"; text: string; createdAt: string }
  | { id: string; role: "assistant"; parts: AdminChatPart[]; createdAt: string };

export interface AdminChatSession {
  id: string;
  messages: AdminChatMessage[];
}

export type AdminChatEvent =
  | { type: "turn_start"; turnId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; isError: boolean; output: string }
  | { type: "error"; message: string }
  | { type: "turn_end"; turnId: string };

// ═════════════════════════════════════════════════════════════════════════════
// Usage analytics: what visitors do on novawerk.io, counted by us, without cookies.
//
//   POST /public/events  webEventsInput → 204   (the browser; text/plain JSON, so no preflight)
//   GET  /admin/metrics  metricsQuery   → AdminMetrics
//
// Every event is a name, the page path and a few enum-like props. Never anything a visitor
// typed, never an IP, a user agent or a stored id: `visit` is random per page load and lives
// only in memory. The API is the real gate and stores only what passes these schemas.
// The catalog and what each metric means: docs/analytics.md.

/** `join` stays readable for old events; the site links to `contribute` since the task board. */
export const CTA_TARGETS = ["submit", "join", "contribute", "tasks", "agent"] as const;
export type CtaTarget = (typeof CTA_TARGETS)[number];

/** Where on the site a call to action sits. `contribute` is the /contribute page itself. */
export const CTA_PLACEMENTS = ["header", "hero", "get-involved", "footer", "contribute"] as const;
export type CtaPlacement = (typeof CTA_PLACEMENTS)[number];

export const FORM_KINDS = ["pitch", "join", "newsletter"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** Why an Intake Agent reply didn't arrive (from the HTTP status, never from the text). */
export const INTAKE_FAILURE_REASONS = ["network", "busy", "limit", "gone", "unavailable", "error"] as const;
export type IntakeFailureReason = (typeof INTAKE_FAILURE_REASONS)[number];

/** A path on novawerk.io, without query or fragment. */
const eventPath = z
  .string()
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/()@%]*$/, "A path, without query or fragment");
/** Lowercase slug, e.g. a project slug or a utm value. */
const eventSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
/** A draft field key, e.g. `projectName`. */
const eventField = z.string().regex(/^[A-Za-z]{1,40}$/);
const eventCount = z.number().int().min(0).max(10_000);
const intakeMode = z.enum(INTAKE_MODES);

const webEvent = <N extends string, P extends z.ZodRawShape>(name: N, props: P) =>
  z.object({ name: z.literal(name), path: eventPath, props: z.strictObject(props) });

/** Every event the website may send. Anything else is rejected. */
export const webEventInput = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("page_view"),
    path: eventPath,
    /** document.referrer; the API keeps only an external host. */
    referrer: z.string().max(500).optional(),
    props: z.strictObject({
      utmSource: eventSlug.optional(),
      utmMedium: eventSlug.optional(),
      utmCampaign: eventSlug.optional(),
    }),
  }),
  webEvent("cta_click", { target: z.enum(CTA_TARGETS), placement: z.enum(CTA_PLACEMENTS) }),
  webEvent("project_click", { project: eventSlug }),

  // The Intake Agent (/submit, /join). `turns` = visitor messages so far.
  webEvent("intake_open", { mode: intakeMode, resumed: z.boolean() }),
  webEvent("intake_unavailable", { mode: intakeMode }),
  webEvent("intake_message", { mode: intakeMode, turn: eventCount, suggestion: z.boolean() }),
  webEvent("intake_reply_failed", { mode: intakeMode, reason: z.enum(INTAKE_FAILURE_REASONS) }),
  webEvent("intake_stop", { mode: intakeMode }),
  webEvent("intake_field_edit", { mode: intakeMode, field: eventField }),
  webEvent("intake_tab", { mode: intakeMode, tab: z.enum(["chat", "draft"]) }),
  webEvent("intake_draft_ready", { mode: intakeMode, turns: eventCount }),
  webEvent("intake_submitted", { mode: intakeMode, turns: eventCount }),
  webEvent("intake_submit_failed", { mode: intakeMode, reason: z.enum(["invalid", "error"]) }),
  webEvent("intake_start_over", { mode: intakeMode, turns: eventCount }),
  webEvent("intake_close", {
    mode: intakeMode,
    turns: eventCount,
    filled: eventCount,
    required: eventCount,
    submitted: z.boolean(),
  }),

  // The task board (docs/contributor-board-design.md). Counts only: no task id, no handle,
  // nothing typed. `filter` names which control changed, never its value.
  webEvent("task_view", { status: z.enum(["suggested", "open", "assigned", "in_review", "done", "closed", "declined", "duplicate"]) }),
  webEvent("task_filter", { filter: z.enum(["search", "area", "size", "status", "skills", "sort", "view"]) }),
  webEvent("propose_open", { edit: z.boolean(), signedIn: z.boolean() }),
  webEvent("propose_sent", { edit: z.boolean() }),
  webEvent("propose_failed", { reason: z.enum(["invalid", "limit", "unavailable"]) }),
  webEvent("proposal_withdrawn", {}),
  webEvent("post_sent", { reply: z.boolean() }),
  webEvent("vote", { on: z.boolean() }),
  webEvent("suggestion_sent", { kind: z.enum(["improvement", "bug"]) }),
  webEvent("sign_in_open", { placement: z.enum(["page", "dialog"]) }),
  webEvent("sign_in_start", { method: z.enum(["github", "google", "email"]) }),
  webEvent("sign_in_done", { method: z.enum(["github", "google", "email"]), firstRun: z.boolean() }),
  webEvent("profile_saved", {}),
  webEvent("account_deleted", {}),

  // The plain step-by-step forms and the newsletter box.
  webEvent("form_step", { form: intakeMode, step: eventCount, of: eventCount }),
  webEvent("form_submitted", { form: z.enum(FORM_KINDS) }),
  webEvent("form_failed", { form: z.enum(FORM_KINDS), reason: z.enum(["invalid", "unavailable"]) }),
]);
export type WebEventInput = z.infer<typeof webEventInput>;
export type WebEventName = WebEventInput["name"];
/** The props of one event, for `track(name, props)`. */
export type WebEventProps<N extends WebEventName> = Extract<WebEventInput, { name: N }>["props"];

export const MAX_EVENTS_PER_BATCH = 25;

/** POST /public/events. The browser batches events and flushes them every few seconds. */
export const webEventsInput = z.object({
  /** Random per page load (crypto.randomUUID). Never stored in the browser. */
  visit: z.uuid(),
  events: z.array(webEventInput).min(1).max(MAX_EVENTS_PER_BATCH),
});
export type WebEventsInput = z.infer<typeof webEventsInput>;

// ─── Metrics (GET /admin/metrics) ────────────────────────────────────────────

export const METRICS_RANGES = [7, 30, 90] as const;

export const metricsQuery = z.object({
  days: z.coerce.number().int().min(1).max(400).default(30),
});
export type MetricsQuery = z.infer<typeof metricsQuery>;

export interface IntakeFunnel {
  /** Page loads where the chat opened. */
  opened: number;
  /** …where the visitor sent at least one message. */
  engaged: number;
  /** …where the draft had every required field. */
  ready: number;
  /** …where the visitor pressed Send and it went through. */
  submitted: number;
}

/** Where visitors left the chat without sending (from `intake_close`). */
export interface IntakeExits {
  beforeFirstMessage: number;
  whileDrafting: number;
  withDraftReady: number;
}

/** Server-side truth for the chat: no ad blocker hides these. */
export interface IntakeChats {
  started: number;
  /** Chats with at least one visitor message. */
  engaged: number;
  submitted: number;
  /** Visitor messages per sent chat, on average. */
  avgTurnsToSubmit: number | null;
}

/** One model-backed agent's turns in the range: volume, errors, speed and tokens. */
export interface AgentUsage {
  /** `intake` or `admin-assistant`. */
  agent: string;
  turns: number;
  errors: number;
  p50Ms: number | null;
  p95Ms: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface AdminMetrics {
  /** `from` and `to` are calendar days in Europe/Berlin, inclusive. */
  range: { days: number; from: string; to: string };
  traffic: {
    /** Page loads (visits) with at least one page view. */
    visits: number;
    pageViews: number;
    /** One row per day in the range, oldest first, days without traffic included. */
    daily: { date: string; visits: number; pageViews: number }[];
    topPages: { path: string; views: number }[];
    topReferrers: { host: string; visits: number }[];
    topCampaigns: { source: string; visits: number }[];
    /** ISO 3166-1 alpha-2, e.g. `DE`, from Vercel's IP geolocation (the IP isn't stored). */
    topCountries: { country: string; visits: number }[];
    /** ISO 3166-2, e.g. `DE-BE` (Berlin). No cities: too close to a person. */
    topRegions: { region: string; visits: number }[];
    /** Visits we couldn't place (local development, or no geolocation). */
    unknownLocation: number;
    devices: { mobile: number; desktop: number };
    ctaClicks: { target: CtaTarget; placement: CtaPlacement; clicks: number }[];
    projectClicks: { project: string; clicks: number }[];
  };
  intake: {
    funnel: Record<IntakeMode, IntakeFunnel>;
    exits: Record<IntakeMode, IntakeExits>;
    chats: Record<IntakeMode, IntakeChats>;
    /** Replies that failed, by reason (browser side). */
    replyFailures: { reason: IntakeFailureReason; count: number }[];
    /** Times the plain form stood in because the assistant was off. */
    fallbacks: number;
  };
  /** The plain forms: sends and failures. */
  forms: Record<FormKind, { submitted: number; failed: number }>;
  agents: AgentUsage[];
  /** New rows in the range, from the tables themselves. */
  received: {
    pitches: number;
    applications: number;
    newsletter: number;
    /** Of those, how many came through the chat (server events). */
    pitchesViaChat: number;
    applicationsViaChat: number;
  };
  /** Right now, whatever the range. */
  inbox: {
    submissions: Record<SubmissionStatus, number>;
    applications: Record<ApplicationStatus, number>;
    oldestNewSubmissionAt: string | null;
    oldestNewApplicationAt: string | null;
    outboxPending: number;
    oldestPendingEmailAt: string | null;
  };
}

// ─── Contributor task board ──────────────────────────────────────────────────
// Open tasks about our own software (docs/contributor-board-design.md). Anyone reads them;
// signed-in members (one account for everyone, NB-ADR-0014) propose, discuss, suggest
// and +1. The rules are enforced in the API (@nw/tasks), never only in the browser.

/** Every stored status. `draft` is members only and never public. */
export const TASK_STATUSES = [
  "draft",
  "suggested",
  "open",
  "assigned",
  "in_review",
  "done",
  "closed",
  "declined",
  "duplicate",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The statuses anyone can see. */
export const PUBLIC_TASK_STATUSES = TASK_STATUSES.filter((s) => s !== "draft") as Exclude<TaskStatus, "draft">[];
export type PublicTaskStatus = Exclude<TaskStatus, "draft">;

export const TASK_SIZES = ["S", "M", "L", "XL"] as const;
export type TaskSize = (typeof TASK_SIZES)[number];

/** Werk per size. Recognition only: it never turns into money, and there are no levels. */
export const TASK_SIZE_WERK: Record<TaskSize, number> = { S: 1, M: 3, L: 8, XL: 20 };

/** Where the work happens. Also the filter on /contributors. */
export const TASK_AREAS = ["web", "admin", "api", "agents", "docs", "ci", "posts"] as const;
export type TaskArea = (typeof TASK_AREAS)[number];

export const TASK_KINDS = ["task", "improvement", "bug"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** What a contributor may suggest. */
export const SUGGESTION_KINDS = ["improvement", "bug"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** "Where in the product" on the suggest form. */
export const SUGGESTION_WHERE = ["site", "admin", "api", "agents", "posts", "videos", "unsure"] as const;
export type SuggestionWhere = (typeof SUGGESTION_WHERE)[number];

/** `draft`: an agent wrote it with a token; its person confirms it in the browser before it counts. */
export const PROPOSAL_STATUSES = ["pending", "chosen", "not_chosen", "withdrawn", "draft"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** The rough timeline on a proposal: a few days, about a week, two weeks. */
export const PROPOSAL_ETAS = ["days", "week", "two_weeks"] as const;
export type ProposalEta = (typeof PROPOSAL_ETAS)[number];

/** What a task event records. Status changes carry from/to; the rest only a note. */
export const TASK_EVENT_KINDS = [
  "created",
  "published",
  "suggested",
  "info_requested",
  "accepted",
  "declined",
  "duplicate",
  "assigned",
  "released",
  "pr_linked",
  "pr_closed",
  "merged",
  "closed",
  /** No activity for 7 days: the assignee gets a reminder (邮件 sends it from this event). */
  "inactivity_reminder",
  /** "I need a week more". */
  "extended",
  "reopened",
  /** A member locked the thread (no new posts) or opened it again. */
  "thread_locked",
  "thread_unlocked",
  /** A member wrote in the thread. */
  "member_posted",
  // Members only (MEMBER_ONLY_EVENT_KINDS): the admin side's record, never on the public timeline.
  "edited",
  "proposal_declined",
  "post_hidden",
  "post_unhidden",
  "reports_dismissed",
  "werk_adjusted",
] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

/**
 * Events that stay on the admin side: the public timeline leaves them out. A declined proposal's
 * note is private to its author; why a post was hidden is for members.
 */
export const MEMBER_ONLY_EVENT_KINDS = [
  "edited",
  "proposal_declined",
  "post_hidden",
  "post_unhidden",
  "reports_dismissed",
  "werk_adjusted",
] as const satisfies readonly TaskEventKind[];

export const PROFILE_ACCENTS = ["green", "blue", "teal", "plum", "amber", "ink"] as const;
export type ProfileAccent = (typeof PROFILE_ACCENTS)[number];
export const PROFILE_BANNERS = ["plain", "grid", "dots", "star"] as const;
export type ProfileBanner = (typeof PROFILE_BANNERS)[number];

/** Scopes of a personal access token (the token API comes later). */
export const TOKEN_SCOPES = [
  "tasks:read",
  "proposals:write",
  "discussion:write",
  "tasks:work",
  "suggestions:write",
  "profile:write",
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Limits per contributor, enforced by the API. */
export const TASK_LIMITS = {
  proposalsPerDay: 5,
  postsPerDay: 30,
  openSuggestions: 3,
  /** One task at a time until the first merge (NB-ADR-0013)… */
  tasksInProgress: 1,
  /** …then up to two. */
  tasksInProgressAfterFirstMerge: 2,
  /** Tasks go back on the board after this many days without activity… */
  idleReleaseDays: 14,
  /** …with a reminder this many days before… */
  idleReminderDays: 7,
  /** …and once per assignment, "I need a week more" adds this many days. */
  extensionDays: 7,
} as const;

/**
 * Emails to a contributor about their own account and tasks (NB-ADR-0013): fixed templates in
 * @nw/email, sent without outbox approval, only to their own verified address. Everything else
 * sent outside Novawerk still waits in the outbox.
 */
export const CONTRIBUTOR_NOTICE_KINDS = [
  "proposal_chosen",
  "proposal_not_chosen",
  "replies",
  "reminder",
  "released",
  "task_closed",
  "suggestion_accepted",
  "suggestion_declined",
  "suggestion_duplicate",
  "suggestion_needs_info",
  "werk_awarded",
  "account_deleted",
] as const;
export type ContributorNoticeKind = (typeof CONTRIBUTOR_NOTICE_KINDS)[number];

/** The notices a contributor may turn off in /settings, and the setting that does it. The rest always go. */
export const OPTIONAL_CONTRIBUTOR_NOTICES = {
  replies: "notifyReplies",
  reminder: "notifyReminders",
} as const satisfies Partial<Record<ContributorNoticeKind, string>>;

/** 42 → "NW-42". */
export const formatTaskId = (n: number) => `NW-${n}`;

/** "NW-42", "nw-42" or "42" → 42; anything else → null. */
export function parseTaskId(value: string): number | null {
  const match = /^(?:nw-)?(\d{1,9})$/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

/** `:id` in /public/tasks/:id and /contrib/tasks/:id. */
export const taskIdParam = z.object({
  id: z.string().transform((v, ctx) => {
    const n = parseTaskId(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "Not a task id" });
      return z.NEVER;
    }
    return n;
  }),
});

/** A comma-separated query value ("web,api") as a list of known values. */
const csvOf = <T extends readonly [string, ...string[]]>(options: T) =>
  z.preprocess(
    (v) =>
      (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
        .flatMap((s: unknown) => String(s).split(","))
        .map((s) => s.trim())
        .filter(Boolean),
    z.array(z.enum(options)).max(options.length),
  );

/**
 * The status filter on /tasks. `active` (the default) is suggested, open, in progress and in
 * review; `proposals` is open with at least one pending proposal; `in_progress` is assigned;
 * `closed` also covers declined and duplicate suggestions.
 */
export const TASK_STATUS_FILTERS = [
  "active",
  "suggested",
  "open",
  "proposals",
  "in_progress",
  "in_review",
  "done",
  "closed",
  "all",
] as const;
export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

/** `updated`: last change first. `votes`: Most wanted (suggestions by +1s). */
export const TASK_SORTS = ["updated", "votes"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

/** GET /public/tasks. Lists are comma-separated in the query string. */
export const taskListQuery = z.object({
  area: csvOf(TASK_AREAS).optional(),
  size: csvOf(TASK_SIZES).optional(),
  status: z.enum(TASK_STATUS_FILTERS).default("active"),
  /** Tasks with any of these skills. */
  skills: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : v),
    z.array(z.string().max(40)).max(10),
  ).optional(),
  /** Matches the title, the summary, or the id ("NW-42", "42"). */
  q: z.string().trim().max(100).optional(),
  sort: z.enum(TASK_SORTS).default("updated"),
  /** `nextCursor` from the previous page. */
  cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type TaskListQuery = z.infer<typeof taskListQuery>;

/** Someone on a task, a post or a vote, as the public sees them. */
export type PublicPerson =
  /** `public: false`: show the handle, unlinked; no name or picture. */
  | { kind: "contributor"; handle: string; name: string | null; avatarUrl: string | null; public: boolean }
  /** A Member writing on the board: the "Novawerk" tag. */
  | { kind: "member"; name: string }
  /** Someone who deleted their account. */
  | { kind: "former" };

/** One row on /tasks (and on the board). */
export interface PublicTask {
  /** "NW-42" */
  id: string;
  number: number;
  kind: TaskKind;
  title: string;
  summary: string;
  area: TaskArea | null;
  size: TaskSize | null;
  /** From the size; null until a member sizes a suggestion. */
  werk: number | null;
  skills: string[];
  status: PublicTaskStatus;
  /** Pending proposals: "3 proposals" on an open task. */
  proposalCount: number;
  /** Visible posts and replies. */
  postCount: number;
  /** +1s (suggestions). */
  voteCount: number;
  assignee: PublicPerson | null;
  suggestedBy: PublicPerson | null;
  /** Suggestions: where in the product. */
  where: SuggestionWhere | null;
  needsInfo: boolean;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTaskPage {
  tasks: PublicTask[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
}

/** A proposal as everyone sees it. The decline note is never here (GET /contrib/me/proposals). */
export interface PublicProposal {
  id: string;
  author: PublicPerson;
  approach: string;
  testing: string;
  eta: ProposalEta;
  status: Exclude<ProposalStatus, "withdrawn" | "draft">;
  /** The token's name when an agent wrote it: "via agent · <name>". */
  viaAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A post or a reply. A hidden one keeps its place without its text or author. */
export interface PublicPost {
  id: string;
  author: PublicPerson | null;
  /** Null when hidden: "Hidden by Novawerk: off-topic or spam". */
  body: string | null;
  hidden: boolean;
  /** The token's name when an agent wrote it: "via agent · <name>". */
  viaAgent: string | null;
  createdAt: string;
  /** Replies, oldest first. Always empty on a reply. */
  replies: PublicPost[];
}

export interface PublicTaskEvent {
  kind: TaskEventKind;
  from: PublicTaskStatus | null;
  to: PublicTaskStatus | null;
  actor: PublicPerson | null;
  note: string | null;
  prUrl: string | null;
  /** The token's name when an agent did it. */
  viaAgent: string | null;
  createdAt: string;
}

/** GET /public/tasks/:id */
export interface PublicTaskDetail extends PublicTask {
  body: string;
  criteria: string[];
  repo: string;
  wherePath: string | null;
  wantsIt: boolean;
  closedReason: string | null;
  duplicateOf: string | null;
  threadLocked: boolean;
  /** A suggestion's screenshot, public once a member accepted it (metadata stripped); else null. */
  screenshotUrl: string | null;
  proposals: PublicProposal[];
  posts: PublicPost[];
  /** Oldest first. */
  events: PublicTaskEvent[];
  voters: PublicPerson[];
}

/** A card on /contributors. Never a Werk number: the wall doesn't rank. */
export interface PublicContributor {
  /** A contributor, or a Member who started a project and opted in to a public profile. */
  kind: "contributor" | "initiator";
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  /** Areas of their merged tasks. */
  areas: TaskArea[];
  /** Their latest merge or accepted idea. */
  lastContributionAt: string;
  /** Has an accepted suggestion: the "idea" mark. */
  idea: boolean;
  /** Initiators: the project they started most recently ("Started <project>"). */
  project: PublicProjectRef | null;
}

/** A portfolio project, as linked from a profile or the wall. */
export interface PublicProjectRef {
  slug: string;
  title: string;
}

/** GET /public/initiators: Members with a public profile who started a public project, one row per project. */
export interface PublicInitiator {
  handle: string;
  name: string;
  project: PublicProjectRef;
  /** When the project was created. */
  startedAt: string;
}

export const CONTRIBUTOR_SORTS = ["newest", "az"] as const;
export type ContributorSort = (typeof CONTRIBUTOR_SORTS)[number];

/** GET /public/contributors */
export const contributorListQuery = z.object({
  sort: z.enum(CONTRIBUTOR_SORTS).default("newest"),
  area: z.enum(TASK_AREAS).optional(),
  /** `nextCursor` from the previous page. */
  cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(48),
});
export type ContributorListQuery = z.infer<typeof contributorListQuery>;

export interface PublicContributorPage {
  contributors: PublicContributor[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
}

export interface PublicTaskRef {
  id: string;
  title: string;
  area: TaskArea | null;
  werk: number | null;
}

/** GET /public/contributors/:handle (public profiles only): a contributor, or an initiator. */
export interface PublicContributorProfile {
  kind: "contributor" | "initiator";
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  about: string | null;
  links: string[];
  accent: ProfileAccent;
  banner: ProfileBanner;
  githubLogin: string | null;
  since: string;
  stats: { done: number; inProgress: number; werk: number };
  inProgress: PublicTaskRef[];
  done: (PublicTaskRef & { mergedAt: string | null })[];
  ideasAccepted: PublicTaskRef[];
  /** Public projects they started (initiators); empty for contributors. */
  projects: PublicProjectRef[];
}

/** The signed-in contributor, for themselves only (GET /auth/contributor/me). */
export interface ContributorMe {
  id: string;
  /** `maintainer` runs Novawerk; everyone else is a `member` (NB-ADR-0014). */
  role: "member" | "maintainer";
  handle: string;
  displayName: string;
  /** Their own address; the settings page masks it. Never in a public response. */
  email: string | null;
  /**
   * GitHub's verified email, masked ("l***@example.com"): used for notices only, never to sign
   * in. Null when there is none (or they sign in by email: then that address is used).
   */
  notifyEmail: string | null;
  github: { id: number; login: string | null } | null;
  avatarUrl: string | null;
  bio: string | null;
  about: string | null;
  links: string[];
  accent: ProfileAccent;
  banner: ProfileBanner;
  public: boolean;
  onWall: boolean;
  pledgeAccepted: boolean;
  /** Still the neutral handle an email sign-up gets (`contributor-7f3a`): ask them to pick one. */
  defaultHandle: boolean;
  /** GitHub is linked and the account isn't suspended: they may propose and work on tasks. */
  canWork: boolean;
  suspended: boolean;
  /** Email me about replies on my posts and tasks (batched, at most one mail per task an hour). */
  notifyReplies: boolean;
  /** Email me when a task I hold has had no activity for 7 days. */
  notifyReminders: boolean;
  createdAt: string;
}

/** GET /auth/me and every sign-in: your own account (NB-ADR-0014). */
export interface AccountMe extends ContributorMe {
  /** A maintainer, or on a project's team: the admin panel opens for them. */
  adminPanel: boolean;
}

/**
 * The answer to writing a proposal (POST, PATCH, confirm): your own view, so a draft says so.
 */
export interface ProposalResult extends Omit<PublicProposal, "status"> {
  status: Exclude<ProposalStatus, "withdrawn">;
  draft: boolean;
}

/** The proposer's own view of a proposal, with the private decline note. */
export interface MyProposal extends PublicProposal {
  taskId: string;
  taskTitle: string;
  declineNote: string | null;
  withdrawn: boolean;
  /** An agent's draft: it counts once they confirm it (POST /contrib/proposals/:id/confirm, browser only). */
  draft: boolean;
}

// Inputs

const contributorEmail = z.string().trim().toLowerCase().max(200).pipe(z.email("That doesn't look like an email address"));

/** POST /auth/email/start */
export const emailStartInput = z.object({ email: contributorEmail });
export type EmailStartInput = z.infer<typeof emailStartInput>;

/**
 * POST /auth/email/verify. `link`: add this address to the signed-in account instead of signing
 * in to the account that has it (NB-ADR-0014: one account, several ways in).
 */
export const emailVerifyInput = z.object({
  email: contributorEmail,
  code: z.string().trim().regex(/^\d{6}$/, "Six digits"),
  link: z.boolean().optional(),
});
export type EmailVerifyInput = z.infer<typeof emailVerifyInput>;

/** POST /auth/google: a Google Identity Services credential. `link` as on emailVerifyInput. */
export const googleSignInInput = z.object({ credential: z.string().min(1).max(8192), link: z.boolean().optional() });
export type GoogleSignInInput = z.infer<typeof googleSignInInput>;

/** @deprecated The names before NB-ADR-0014. */
export const contributorEmailStartInput = emailStartInput;
export type ContributorEmailStartInput = EmailStartInput;
/** @deprecated The names before NB-ADR-0014. */
export const contributorEmailVerifyInput = emailVerifyInput;
export type ContributorEmailVerifyInput = EmailVerifyInput;

/**
 * `returnTo` on GET /auth/github/start: a path on the website, or an address on one of our own
 * apps (the admin panel, the chat) that the API knows. Never another site.
 */
export const githubStartQuery = z.object({
  returnTo: z
    .string()
    .max(300)
    .regex(/^(?:\/(?![/\\])|https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/|$)|http:\/\/localhost:\d+(?:\/|$))[^\s]*$/, "A path on novawerk.io")
    .optional(),
});

const markdown = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min > 1 ? `${label}: at least ${min} characters` : `${label}: please write something`)
    .max(max, `${label}: keep it under ${max} characters`);

/** POST /contrib/tasks/:id/proposals */
export const proposalInput = z.object({
  approach: markdown("What you'll change", 1, 4000),
  testing: z.string().trim().max(4000, "Keep it under 4000 characters").default(""),
  eta: z.enum(PROPOSAL_ETAS, { error: "Pick a rough timeline" }),
  /** "I read what done means for this task, and I'll release it if I can't finish." */
  readCriteria: mustAccept("Please confirm you read what done means for this task"),
});
export type ProposalInput = z.input<typeof proposalInput>;

/** PATCH /contrib/proposals/:id */
export const proposalUpdateInput = z
  .object({
    approach: markdown("What you'll change", 1, 4000).optional(),
    testing: z.string().trim().max(4000, "Keep it under 4000 characters").optional(),
    eta: z.enum(PROPOSAL_ETAS).optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type ProposalUpdateInput = z.infer<typeof proposalUpdateInput>;

/** POST /contrib/tasks/:id/posts */
export const postInput = z.object({
  body: markdown("Your post", 1, 4000),
  /** The post this replies to. One level only. */
  replyTo: z.uuid().optional(),
});
export type PostInput = z.infer<typeof postInput>;

// Suggestion screenshots: the browser uploads to the PRIVATE store with a ticket; the file shows
// publicly (copied without metadata) only once a member accepts the suggestion.

export const SUGGESTION_SCREENSHOT_TYPES = ["image/png", "image/jpeg"] as const;
export type SuggestionScreenshotType = (typeof SUGGESTION_SCREENSHOT_TYPES)[number];
export const MAX_SUGGESTION_SCREENSHOT_BYTES = 2 * 1024 * 1024;
/** `_suggestions/<contributor id>/<uuid>-<file name>` in the private store. */
export const SUGGESTION_SCREENSHOT_PREFIX = "_suggestions/";

/** POST /contrib/uploads/suggestion-screenshot */
export const suggestionScreenshotUploadInput = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(SUGGESTION_SCREENSHOT_TYPES, { error: "A PNG or JPEG" }),
});
export type SuggestionScreenshotUploadInput = z.infer<typeof suggestionScreenshotUploadInput>;

export interface SuggestionScreenshotTicket {
  token: string;
  pathname: string;
}

/** POST /contrib/suggestions. No size and no Werk: a member sets them when accepting. */
export const suggestionInput = z.object({
  title: z.string().trim().min(3, "Give it a short title").max(120, "Keep it under 120 characters"),
  kind: z.enum(SUGGESTION_KINDS, { error: "Improvement or bug?" }),
  body: markdown("What and why", 20, 4000),
  where: z.enum(SUGGESTION_WHERE, { error: "Pick where in the product" }),
  /** An optional page or path, e.g. /tasks or apps/api/src/app.ts. */
  path: z.string().trim().max(200, "Keep it under 200 characters").optional(),
  /** "I'd like to do this myself." */
  doItMyself: z.boolean().default(false),
  /** A screenshot uploaded with a ticket from POST /contrib/uploads/suggestion-screenshot. */
  screenshot: z
    .object({
      pathname: z
        .string()
        .max(300)
        .regex(/^_suggestions\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[a-z0-9.-]{1,80}$/, "That upload didn't work. Attach the screenshot again."),
    })
    .optional(),
});
export type SuggestionInput = z.input<typeof suggestionInput>;

/** PATCH /contrib/me/profile */
export const profileUpdateInput = z
  .object({
    handle: handle("lena-k", 39).optional(),
    displayName: z.string().trim().min(1, "Enter a name").max(100, "Keep it under 100 characters").optional(),
    bio: nullableText(160).optional(),
    about: nullableText(1500).optional(),
    links: z
      .array(z.url({ protocol: /^https?$/, error: "Links start with https://" }).max(300))
      .max(4, "Up to 4 links")
      .optional(),
    accent: z.enum(PROFILE_ACCENTS).optional(),
    banner: z.enum(PROFILE_BANNERS).optional(),
    public: z.boolean().optional(),
    onWall: z.boolean().optional(),
    notifyReplies: z.boolean().optional(),
    notifyReminders: z.boolean().optional(),
    /** The pledge and DCO tick on first run. Can't be taken back here. */
    acceptPledge: z.literal(true).optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type ProfileUpdateInput = z.infer<typeof profileUpdateInput>;

/** DELETE /contrib/me: type your handle to confirm. */
export const accountDeleteInput = z.object({ confirmHandle: z.string().trim().toLowerCase().min(1).max(40) });
export type AccountDeleteInput = z.infer<typeof accountDeleteInput>;

// ─── Task board: assignee actions, my tasks, blocks ──────────────────────────

/** POST /contrib/tasks/:id/pr: link a pull request by hand when the webhook missed it. */
export const prLinkInput = z.object({
  url: z
    .string()
    .trim()
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d{1,9}\/?$/, "A pull request link, e.g. https://github.com/Novawerk/novawerk-workspace/pull/212"),
});
export type PrLinkInput = z.infer<typeof prLinkInput>;

/** POST /contrib/tasks/:id/release: give the task back. The reason shows on the timeline. */
export const releaseInput = z.object({ reason: z.string().trim().max(300, "Keep it under 300 characters").optional() });
export type ReleaseInput = z.infer<typeof releaseInput>;

/** POST /contrib/posts/:id/report. The reason is for members only. */
export const reportInput = z.object({ reason: z.string().trim().max(500, "Keep it under 500 characters").optional() });
export type ReportInput = z.infer<typeof reportInput>;

/** GET /contrib/tasks/:id/guide (the assignee only). */
export interface TaskGuide {
  taskId: string;
  markdown: string;
}

/** GET /contrib/me/tasks: what I hold, and my proposals still waiting. */
export interface MyTasks {
  held: PublicTask[];
  proposals: MyProposal[];
}

/**
 * GET /public/blocks: every merged task, oldest first, for the builders scene. `handle` is the
 * real handle only for a public profile; anyone else is a stable opaque `anon-<8 hex>`.
 */
export interface PublicBlock {
  id: string;
  title: string;
  area: TaskArea | null;
  size: TaskSize | null;
  handle: string;
  mergedAt: string;
}

// ─── Personal access tokens (agents, scripts, the MCP server) ────────────────

/** How long a token lives. */
export const TOKEN_EXPIRY_DAYS = [30, 90] as const;

/** `tasks:read` is always on. Tokens never manage tokens, sign-in or the account. */
export const TOKEN_LIMITS = {
  activePerContributor: 10,
  /** Requests per token per hour: reads (GET, MCP reads) and writes. */
  readsPerHour: 1000,
  writesPerHour: 100,
} as const;

/** POST /contrib/tokens (browser session only). */
export const tokenCreateInput = z.object({
  name: z.string().trim().min(1, "Give it a name, e.g. my laptop's Claude Code").max(60, "Keep it under 60 characters"),
  scopes: z.array(z.enum(TOKEN_SCOPES)).max(TOKEN_SCOPES.length).default([]),
  expiresInDays: z.union([z.literal(30), z.literal(90)], { error: "30 or 90 days" }),
});
export type TokenCreateInput = z.input<typeof tokenCreateInput>;

/** A token as its owner sees it in /settings/tokens. Never the secret, except once on creation. */
export interface ContributorTokenInfo {
  id: string;
  name: string;
  /** The first characters, e.g. "nwt_3f9a12bc", to tell tokens apart. */
  prefix: string;
  scopes: TokenScope[];
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  expired: boolean;
}

/** The answer to POST /contrib/tokens: the secret shows this once. */
export interface CreatedToken extends ContributorTokenInfo {
  secret: string;
}

// ─── Contributor task board: admin (/admin/tasks, /admin/proposals, …) ───────
// Members with can_admin run the board: write and publish tasks, choose a plan, triage
// suggestions, moderate, and adjust Werk. Every action writes a task event.

/** The hint under each size in the task editor. */
export const TASK_SIZE_HINTS: Record<TaskSize, string> = {
  S: "An afternoon or two.",
  M: "About a week of evenings.",
  L: "Two to three weeks.",
  XL: "A month or more. Think about splitting it.",
};

/** The filters on the admin task table. `decide`: suggestions to triage, open tasks with plans. */
export const ADMIN_TASK_FILTERS = ["all", "decide", "stale", "draft", "active", "finished"] as const;
export type AdminTaskFilter = (typeof ADMIN_TASK_FILTERS)[number];

/** An assigned task with no activity for this long is stale: the reminder goes out. */
export const TASK_STALE_DAYS = 7;

/** A required note, a reason or a question from a member. */
const memberNote = (label: string, max = 2000) =>
  z.string().trim().min(1, `${label}: please write something`).max(max, `${label}: keep it under ${max} characters`);

const doneWhenLines = z
  .array(z.string().trim().min(1, "Empty line").max(300, "Keep each line under 300 characters"))
  .max(12, "Up to 12 lines");

const skillTags = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(40, "Keep each skill under 40 characters"),
  )
  .max(10, "Up to 10 skills");

/** owner/name on GitHub. */
const repoName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Like Novawerk/novawerk-workspace");

const taskFields = {
  title: z.string().trim().min(3, "Give it a short title").max(120, "Keep it under 120 characters"),
  summary: z.string().trim().max(200, "Keep it under 200 characters"),
  body: z.string().trim().max(20_000, "Keep it under 20000 characters"),
  criteria: doneWhenLines,
  area: z.enum(TASK_AREAS, { error: "Pick an area" }),
  size: z.enum(TASK_SIZES, { error: "Pick a size" }),
  skills: skillTags,
  repo: repoName,
  /** A member's handle, or null. */
  reviewerId: z.string().trim().min(1).max(80).nullable(),
  /** The contribution guide: template plus task notes, Markdown. */
  guideTemplate: nullableText(20_000),
};

/** POST /admin/tasks: a new draft. */
export const adminTaskInput = z.object({
  title: taskFields.title,
  summary: taskFields.summary.default(""),
  body: taskFields.body.default(""),
  criteria: taskFields.criteria.default([]),
  area: taskFields.area,
  size: taskFields.size,
  skills: taskFields.skills.default([]),
  repo: taskFields.repo.default("Novawerk/novawerk-workspace"),
  reviewerId: taskFields.reviewerId.default(null),
  guideTemplate: taskFields.guideTemplate.optional(),
  /** Publish at once instead of saving a draft. */
  publish: z.boolean().default(false),
});
export type AdminTaskInput = z.input<typeof adminTaskInput>;

/**
 * `pnpm import:tasks <file.json>`: a list of tasks to publish as open, each like POST
 * /admin/tasks (no `publish`: an import always publishes). Titles must differ (any case).
 */
export const taskImportInput = z
  .array(adminTaskInput.omit({ publish: true }))
  .min(1, "The file has no tasks")
  .max(200, "Up to 200 tasks per import")
  .superRefine((list, ctx) => {
    const seen = new Map<string, number>();
    list.forEach((t, i) => {
      const key = t.title.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "title"], message: `Same title as task ${seen.get(key)! + 1} in this file` });
      seen.set(key, i);
    });
  });
export type TaskImportInput = z.input<typeof taskImportInput>;

/** PATCH /admin/tasks/:id */
export const adminTaskUpdateInput = z
  .object({
    title: taskFields.title.optional(),
    summary: taskFields.summary.optional(),
    body: taskFields.body.optional(),
    criteria: taskFields.criteria.optional(),
    area: taskFields.area.optional(),
    size: taskFields.size.optional(),
    skills: taskFields.skills.optional(),
    repo: taskFields.repo.optional(),
    reviewerId: taskFields.reviewerId.optional(),
    guideTemplate: taskFields.guideTemplate.optional(),
  })
  .refine(hasChanges, { message: "Nothing to update" });
export type AdminTaskUpdateInput = z.input<typeof adminTaskUpdateInput>;

/** POST /admin/tasks/:id/close and /reopen: the reason is public, on the timeline. */
export const taskReasonInput = z.object({ reason: memberNote("Reason", 500) });
export type TaskReasonInput = z.infer<typeof taskReasonInput>;

/** POST /admin/tasks/:id/posts: a member writes in the thread (the "Novawerk" tag). */
export const memberPostInput = z.object({
  body: memberNote("Your post", 4000),
  replyTo: z.uuid().optional(),
});
export type MemberPostInput = z.infer<typeof memberPostInput>;

/** POST /admin/proposals/:id/choose: assign the task; private notes per declined proposal id. */
export const chooseProposalInput = z.object({
  notes: z.record(z.uuid(), z.string().trim().max(1000, "Keep each note under 1000 characters")).default({}),
});
export type ChooseProposalInput = z.input<typeof chooseProposalInput>;

/** POST /admin/proposals/:id/decline: the note only reaches the proposer. */
export const declineProposalInput = z.object({ note: memberNote("Note", 1000) });
export type DeclineProposalInput = z.infer<typeof declineProposalInput>;

/** POST /admin/suggestions/:id/accept */
export const acceptSuggestionInput = z.object({
  area: z.enum(TASK_AREAS, { error: "Pick an area" }),
  size: z.enum(TASK_SIZES, { error: "Pick a size" }),
  criteria: doneWhenLines.min(1, "Add at least one done-when line"),
  /** Give it straight to the suggester (only when they ticked "do it myself"). */
  assignToSuggester: z.boolean().default(false),
});
export type AcceptSuggestionInput = z.input<typeof acceptSuggestionInput>;

/** POST /admin/suggestions/:id/duplicate */
export const duplicateSuggestionInput = z.object({
  of: z.string().transform((v, ctx) => {
    const n = parseTaskId(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "A task id like NW-12" });
      return z.NEVER;
    }
    return n;
  }),
});
export type DuplicateSuggestionInput = z.input<typeof duplicateSuggestionInput>;

/** POST /admin/suggestions/:id/ask: the question goes into the thread. */
export const askInfoInput = z.object({ question: memberNote("Question", 4000) });
export type AskInfoInput = z.infer<typeof askInfoInput>;

/** POST /admin/suggestions/:id/decline: the note shows on the closed suggestion. */
export const declineSuggestionInput = z.object({ note: memberNote("Note", 1000) });
export type DeclineSuggestionInput = z.infer<typeof declineSuggestionInput>;

/** POST /admin/discussions/:id/hide and /unhide; POST /admin/contributors/:id/suspend and /unsuspend. */
export const moderationInput = z.object({ reason: memberNote("Reason", 500) });
export type ModerationInput = z.infer<typeof moderationInput>;

/** GET /admin/discussions?filter=: every post, the reported ones still open, or the hidden ones. */
export const DISCUSSION_FILTERS = ["all", "reported", "hidden"] as const;
export type DiscussionFilter = (typeof DISCUSSION_FILTERS)[number];

/** The admin's sorts on the suggestion queue. */
export const SUGGESTION_SORTS = ["oldest", "votes"] as const;
export type SuggestionSort = (typeof SUGGESTION_SORTS)[number];

/** POST /admin/werk: a new ledger row. Rows are never edited. */
export const werkAdjustInput = z.object({
  contributorId: z.uuid({ error: "Pick a contributor" }),
  delta: z
    .number({ error: "A whole number" })
    .int("A whole number")
    .min(-100, "Between -100 and 100")
    .max(100, "Between -100 and 100")
    .refine((n) => n !== 0, "Not zero"),
  reason: memberNote("Reason", 300),
  /** The task it is about, when there is one ("NW-12"). */
  taskId: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const n = parseTaskId(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "A task id like NW-12" });
        return z.NEVER;
      }
      return n;
    })
    .optional(),
});
export type WerkAdjustInput = z.input<typeof werkAdjustInput>;
