import type { AgentHooks, ModelProvider } from "@nw/agent-harness";
import type { Contributor, Database, Member } from "@nw/db";
import type { Files } from "@nw/object-store";
import type { CardFontLoader } from "@nw/promo/cards";
import type { TeamNotification } from "@nw/email";

import type { GitHubApi } from "@nw/github";
import type { TokenContext } from "@nw/tasks";

import type { GitHubOAuth } from "./contributor-auth.js";
import type { ContributorNoticeSender } from "./contributor-notices.js";

/** Plain config values. Built from env in src/deps.ts; tests pass their own. */
export interface ApiConfig {
  /** Browser origins allowed to call the public routes (/health, /public/*). */
  allowedOrigins: string[];
  /** Browser origins allowed to call /auth/* and /admin/* with the session cookie. */
  adminOrigins: string[];
  /**
   * Browser origins allowed to call /auth/contributor/* and /contrib/* with the contributor
   * cookie: the website. Defaults to the web origins in `allowedOrigins`.
   */
  contributorOrigins?: string[];
  /** OAuth client id of the admin panel's Google Identity Services button. */
  googleClientId: string;
  /** HS256 key for the `nw_session` cookie. */
  sessionSecret: string;
  /**
   * Local development only: enables POST /auth/dev (sign in as an admin by email, no Google).
   * readEnv refuses to turn it on when running on Vercel.
   */
  devLogin?: boolean;
  /** Ping apps/web to revalidate after portfolio edits (POST with `x-revalidate-secret`). */
  webRevalidate?: { url: string; secret: string };
  /** Vercel Cron's bearer token for /cron/*. Unset: those routes answer 404. */
  cronSecret?: string;
  /**
   * The website's server sends it as `x-nw-web-key` on its task board reads, which then skip the
   * anonymous per-network limit (Vercel's shared egress IPs would hit it). Unset: no exemption.
   */
  webReadKey?: string;
  /** GitHub's webhook signing secret. Unset: POST /webhooks/github answers 404. */
  githubWebhookSecret?: string;
  /** Public origins of this API and of the website: the links in newsletter emails point there. */
  publicUrls: { apiUrl: string; webUrl: string };
}

/**
 * How approved outbox emails leave. Without `resendApiKey` a member can still approve; the email
 * then waits as `approved` until someone presses Send with a key in place.
 */
export interface OutboxSender {
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
  resendApiKey?: string;
}

/** Emails a 6-digit sign-in code. Wraps `sendSignInCode` from @nw/email (member or contributor wording). */
export type SignInCodeSender = (to: string, code: string) => Promise<unknown>;

/** Emails the newsletter's confirmation link. Wraps `sendNewsletterConfirmation` from @nw/email. */
export type NewsletterConfirmationSender = (to: string, confirmUrl: string) => Promise<unknown>;

/** Mail to the info@ group, relayed to Slack (POST /webhooks/resend). See src/inbound-mail.ts. */
export interface InboundMailOptions {
  /** The `whsec_…` signing secret of the Resend webhook. */
  webhookSecret: string;
  /** A full-access Resend key: reading a received email needs it. Separate from the sending key. */
  resendApiKey: string;
  /** Slack incoming webhook of the channel that shows the mail. */
  slackWebhookUrl: string;
  /** Only mail with this `List-ID` is posted, e.g. "info.novawerk.io". */
  listId: string;
  fetch?: typeof fetch;
}

/** Sends an internal notification to the team inbox. Wraps `notifyTeam` in production. */
export type Notifier = (message: TeamNotification) => Promise<unknown>;

export interface GoogleIdentity {
  email: string;
  sub: string;
  name?: string;
}

/** Verifies a Google Identity Services ID token. Throws if it is not valid for us. */
export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;

export type Logger = Pick<Console, "error" | "warn">;

/** Which new row the intake agent should look at. */
export interface IntakeRef {
  table: "project_submissions" | "member_applications";
  id: string;
}

/** Starts the intake agent for one new row. In production: in the API, after the response (agents.ts). */
export type IntakeTrigger = (ref: IntakeRef) => Promise<unknown>;

/** What the promo agent should draft: one post, or the posts a project has reached. */
export type PromoRef = { postId: string } | { projectId: string };

/** Starts the promo agent. In production: in the API, after the response (agents.ts). */
export type PromoTrigger = (ref: PromoRef) => Promise<unknown>;

/** The Intake Agent chat (/public/intake/*). Built from env in src/deps.ts; tests pass a MockProvider. */
export interface IntakeChatOptions {
  provider: ModelProvider;
  /** Visitor messages per session. Default 40. */
  maxTurns?: number;
  /** New sessions per client IP per hour (in-memory, per instance). Default 20. */
  sessionsPerHour?: number;
  /** Model calls per visitor message. Default 6. */
  maxSteps?: number;
  /** How long a running turn holds the session lock before it expires on its own. Default 5 min. */
  turnLockMs?: number;
  hooks?: AgentHooks[];
}

/** Either a working chat, or the reason it is switched off (its routes then answer 503). */
export type IntakeChatDeps = IntakeChatOptions | { unavailable: string };

/** The admin assistant (/admin/chat). Same LLM settings as the Intake Agent, its own tools. */
export interface AdminChatOptions {
  provider: ModelProvider;
  /** Model calls per message. Default 8. */
  maxSteps?: number;
  /** Messages per chat. Default 200. */
  maxTurns?: number;
  /** How long a running turn holds the session lock before it expires on its own. Default 5 min. */
  turnLockMs?: number;
  hooks?: AgentHooks[];
}

/** Either a working assistant, or the reason it is switched off (its routes then answer 503). */
export type AdminChatDeps = AdminChatOptions | { unavailable: string };

export interface AppDeps {
  db: Database;
  env: ApiConfig;
  notify: Notifier;
  /** Defaults to verifying against Google's JWKS. Tests inject a fake. */
  verifyGoogleToken?: GoogleVerifier;
  /** Defaults to `console`. */
  logger?: Logger;
  /** Optional: without it the intake agent's safety cron picks new rows up later. */
  triggerIntake?: IntakeTrigger;
  /** Optional: without it new posts wait for the promo agent's daily run. */
  triggerPromo?: PromoTrigger;
  /** Drafts one post now and waits for it (the promo agent's code). Optional: without it the post chat can't rewrite. */
  draftPost?: (postId: string) => Promise<void>;
  /** Post pictures. Tests pass offline fonts and a fake fetch for the photo. */
  cards?: { fonts?: CardFontLoader; fetch?: typeof fetch };
  /** Optional: without it the Intake Agent chat routes answer 503. */
  intakeChat?: IntakeChatDeps;
  /** Optional: without it approving an outbox email never sends it. */
  outbox?: OutboxSender;
  /** Optional: without it /admin/chat answers 503. */
  adminChat?: AdminChatDeps;
  /** Vercel Blob. Optional: without a store's token, uploads to it answer 503. */
  files?: Files;
  /** Signing in by email. Optional: without it /auth/email/* answer 503 (Google still works). */
  sendSignInCode?: SignInCodeSender;
  /** Emails to contributors about their own tasks (src/contributor-notices.ts). Optional: without it the cron queues but sends nothing. */
  sendContributorNotice?: ContributorNoticeSender;
  /** Contributors' codes: the task board wording. Optional: without it /auth/contributor/email/* answer 503. */
  sendContributorSignInCode?: SignInCodeSender;
  /** Double opt-in emails. Optional: without it POST /public/subscribe answers 503. */
  sendNewsletterConfirmation?: NewsletterConfirmationSender;
  /** Optional: without it POST /webhooks/resend answers 404. */
  inboundMail?: InboundMailOptions;
  /** Contributor sign-in with GitHub. Optional: without it /auth/contributor/github/* answer 503. */
  githubOAuth?: GitHubOAuth;
  /**
   * The GitHub App on our repository (comments, labels, the nightly reconcile). Optional: without
   * it the webhook still moves tasks but says nothing on the PR, and the reconcile is skipped.
   */
  githubApi?: GitHubApi;
}

/** The signed-in member as the admin panel sees it. */
export interface AdminMember {
  id: string;
  displayName: string;
  email: string;
  canAdmin: boolean;
}

export const toAdminMember = (m: Member): AdminMember => ({
  id: m.id,
  displayName: m.displayName,
  email: m.email,
  canAdmin: m.canAdmin,
});

/** Hono env for every router in this app. */
export interface ApiEnv {
  /**
   * `member` on /admin (src/auth.ts), `contributor` on /contrib (src/contributor-auth.ts). Never
   * both. `token` is set when the contributor came with a personal access token (src/token-gate.ts).
   */
  Variables: { member: AdminMember; contributor: Contributor; token: TokenContext | undefined };
}
