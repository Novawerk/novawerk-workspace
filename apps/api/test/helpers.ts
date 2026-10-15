// Test harness: one in-memory Postgres (PGlite) per test file with the real migrations from
// packages/db, truncated between tests, plus an app wired to fakes.

import { vi } from "vitest";

import type { Database } from "@nw/db";
import type { TeamNotification } from "@nw/email";
import type { FileAccess, Files, ListedFile, OpenedFile, StoredFile, TicketRequest, UploadTicket } from "@nw/object-store";

import { createApp } from "../src/app.js";
import { SESSION_COOKIE, signSession } from "../src/auth.js";
import { CONTRIBUTOR_COOKIE, signContributorSession, type GitHubOAuth } from "../src/contributor-auth.js";
import type {
  AdminChatDeps,
  ApiConfig,
  GoogleVerifier,
  InboundMailOptions,
  IntakeChatDeps,
  IntakeTrigger,
  NewsletterConfirmationSender,
  OutboxSender,
  PromoTrigger,
  SignInCodeSender,
} from "../src/types.js";

export { createTestDb, resetDb } from "@nw/db/testing";

export const TEST_SECRET = "test-session-secret-0123456789-abcdef";
export const WEB_ORIGIN = "https://novawerk.io";
export const ADMIN_ORIGIN = "https://admin.novawerk.io";

export const TEST_CONFIG: ApiConfig = {
  allowedOrigins: [WEB_ORIGIN, ADMIN_ORIGIN, "http://localhost:3000"],
  adminOrigins: [ADMIN_ORIGIN],
  googleClientId: "test-client-id.apps.googleusercontent.com",
  sessionSecret: TEST_SECRET,
  publicUrls: { apiUrl: "https://api.novawerk.io", webUrl: WEB_ORIGIN },
};

/** Fake Google verifier: the credential `google:<email>` is valid for that email. */
export const fakeGoogle: GoogleVerifier = async (credential) => {
  if (!credential.startsWith("google:")) throw new Error("bad token");
  return { email: credential.slice("google:".length), sub: "g-123" };
};

export function makeApp(
  db: Database,
  opts: {
    notify?: (m: TeamNotification) => Promise<unknown>;
    triggerIntake?: IntakeTrigger;
    triggerPromo?: PromoTrigger;
    draftPost?: (postId: string) => Promise<void>;
    env?: Partial<ApiConfig>;
    intakeChat?: IntakeChatDeps;
    outbox?: OutboxSender;
    adminChat?: AdminChatDeps;
    files?: Files;
    cardFetch?: typeof fetch;
    sendSignInCode?: SignInCodeSender;
    sendNewsletterConfirmation?: NewsletterConfirmationSender;
    inboundMail?: InboundMailOptions;
    githubOAuth?: GitHubOAuth;
  } = {},
) {
  const sent: TeamNotification[] = [];
  const notify = vi.fn(
    opts.notify ??
      (async (message: TeamNotification) => {
        sent.push(message);
      }),
  );
  const logger = { error: vi.fn(), warn: vi.fn() };
  const app = createApp({
    db,
    env: { ...TEST_CONFIG, ...opts.env },
    notify,
    verifyGoogleToken: fakeGoogle,
    logger,
    ...(opts.triggerIntake ? { triggerIntake: opts.triggerIntake } : {}),
    ...(opts.triggerPromo ? { triggerPromo: opts.triggerPromo } : {}),
    ...(opts.draftPost ? { draftPost: opts.draftPost } : {}),
    // Pictures render offline in tests: the renderer's built-in face, a fake fetch for photos.
    cards: { fonts: async () => [], fetch: opts.cardFetch ?? (async () => new Response("no network in tests", { status: 503 })) },
    ...(opts.intakeChat ? { intakeChat: opts.intakeChat } : {}),
    ...(opts.outbox ? { outbox: opts.outbox } : {}),
    ...(opts.adminChat ? { adminChat: opts.adminChat } : {}),
    ...(opts.files ? { files: opts.files } : {}),
    ...(opts.sendSignInCode ? { sendSignInCode: opts.sendSignInCode } : {}),
    ...(opts.sendNewsletterConfirmation ? { sendNewsletterConfirmation: opts.sendNewsletterConfirmation } : {}),
    ...(opts.inboundMail ? { inboundMail: opts.inboundMail } : {}),
    ...(opts.githubOAuth ? { githubOAuth: opts.githubOAuth } : {}),
  });
  return { app, notify, sent, logger };
}

export type TestApp = ReturnType<typeof makeApp>["app"];

/** A signed-in admin request (default member `ada`). Pass `memberId: null` for no session. */
export async function adminFetch(
  app: TestApp,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  memberId: string | null = "ada",
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (memberId) headers.Cookie = await sessionCookie(memberId);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

/** `adminFetch` + JSON body + status check in one line. */
export async function adminJson<T = any>(
  app: TestApp,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  expectStatus = 200,
): Promise<T> {
  const res = await adminFetch(app, method, path, body);
  const json = (await res.json()) as T;
  if (res.status !== expectStatus) {
    throw new Error(`${method} ${path} → ${res.status}, expected ${expectStatus}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** The admins and members most tests start from. */
export const TEST_MEMBERS = [
  { id: "ada", displayName: "Ada", email: "ada@novawerk.io", canAdmin: true },
  { id: "grace", displayName: "Grace", email: "grace@novawerk.io" },
  { id: "linus", displayName: "Linus", email: "linus@novawerk.io", canAdmin: true, active: false },
];

export function postJson(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

export async function sessionCookie(memberId: string, secret = TEST_SECRET): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(memberId, secret)}`;
}

/** The contributor session cookie for a contributor id. */
export async function contributorCookie(contributorId: string, secret = TEST_SECRET): Promise<string> {
  return `${CONTRIBUTOR_COOKIE}=${await signContributorSession(contributorId, secret)}`;
}

const long = (label: string) => `${label}: ${Array(6).fill("detail").join(" ")}`;

export const validSubmission = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  projectName: "Bouldering routes",
  product: long("A map of local bouldering routes"),
  userJourney: long("Climbers open the app at the crag"),
  referencesAndInnovation: long("Like 27crags, but community-run"),
  team: long("Ada plus two climbers who code"),
  timeline: long("Prototype by spring"),
  links: "https://example.com/deck",
  consent: true,
};

export const validApplication = {
  name: "Grace Hopper",
  email: "grace@example.com",
  city: "Berlin",
  functions: ["developer", "research"],
  background: "Compiler engineer",
  motivation: long("We want to build open tools with people we like"),
  availability: "2to5",
  links: "",
  consent: true,
};

/** An in-memory file store that records what the API asked for. */
export class FakeFiles implements Files {
  readonly ready: Record<FileAccess, boolean>;
  readonly tickets: { access: FileAccess; request: TicketRequest }[] = [];
  /** `uploadedAt` defaults to now. */
  readonly privateFiles = new Map<string, { contentType: string; body: string; uploadedAt?: Date }>();
  readonly deletedPublic: string[] = [];
  readonly deletedPrivate: string[] = [];

  constructor(ready: Partial<Record<FileAccess, boolean>> = {}) {
    this.ready = { public: ready.public ?? true, private: ready.private ?? true };
  }

  async uploadTicket(access: FileAccess, request: TicketRequest): Promise<UploadTicket> {
    this.tickets.push({ access, request });
    return { token: `client-token-${this.tickets.length}`, pathname: request.pathname, access };
  }

  async statPrivate(pathname: string): Promise<StoredFile | null> {
    const f = this.privateFiles.get(pathname);
    return f ? { pathname, contentType: f.contentType, size: f.body.length } : null;
  }

  async openPrivate(pathname: string): Promise<OpenedFile | null> {
    const f = this.privateFiles.get(pathname);
    if (!f) return null;
    return { pathname, contentType: f.contentType, size: f.body.length, stream: new Response(f.body).body! };
  }

  async listPrivate(prefix: string): Promise<ListedFile[]> {
    return [...this.privateFiles]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, f]) => ({ pathname, size: f.body.length, uploadedAt: f.uploadedAt ?? new Date() }));
  }

  async deletePrivate(pathname: string): Promise<void> {
    this.deletedPrivate.push(pathname);
    this.privateFiles.delete(pathname);
  }

  async deletePublicImages(urls: string[]): Promise<void> {
    this.deletedPublic.push(...urls);
  }
}

/** A one-page PDF with these lines of text (Helvetica), for the CV reader. */
export function tinyPdf(lines: string[]): string {
  const text = lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ");
  const content = `BT /F1 12 Tf 72 720 Td 14 TL ${text} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  const entries = offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  return `${pdf}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
