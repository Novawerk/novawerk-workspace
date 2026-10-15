// Turns an env object into AppDeps. Pure: the entry files pass `process.env` in.

import {
  LLM_PROVIDERS,
  LlmConfigError,
  createConsoleLogHook,
  createProvider,
  isLlmProviderName,
  resolveLlmConfig,
  type LlmConfig,
} from "@nw/agent-harness";
import { loadConfig, requiredVars } from "@nw/config";
import { createDb } from "@nw/db";
import { BlobFiles, type FileStoreConfig } from "@nw/object-store";
import { notifyTeam, sendNewsletterConfirmation, sendSignInCode, type NotifyOptions } from "@nw/email";

import { adminMockStep } from "./admin-chat/mock.js";
import { createGitHubOAuth } from "./contributor-auth.js";
import { inProcessIntakeTrigger, inProcessPromoRunner, inProcessPromoTrigger } from "./agents.js";
import { intakeMockStep } from "./intake-chat/mock.js";
import type {
  AdminChatDeps,
  ApiConfig,
  AppDeps,
  InboundMailOptions,
  IntakeChatDeps,
  IntakeTrigger,
  OutboxSender,
  PromoTrigger,
} from "./types.js";

export type EnvSource = Record<string, string | undefined>;

export const ENV_DEFAULTS = {
  NOTIFY_FROM: "Novawerk <info@novawerk.io>",
  NOTIFY_TO: "info@novawerk.io",
  ALLOWED_ORIGINS:
    "https://novawerk.io,https://www.novawerk.io,https://admin.novawerk.io,http://localhost:3000,http://localhost:5173",
  ADMIN_ORIGINS: "https://admin.novawerk.io,http://localhost:5173",
  PUBLIC_API_URL: "https://api.novawerk.io",
  PUBLIC_WEB_URL: "https://novawerk.io",
  /** Google Groups' List-ID for info@novawerk.io. */
  INBOUND_LIST_ID: "info.novawerk.io",
} as const;

const INBOUND_MAIL_KEYS = ["RESEND_WEBHOOK_SECRET", "RESEND_RECEIVING_API_KEY", "SLACK_INBOX_WEBHOOK_URL"] as const;

const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_CRON_SECRET_LENGTH = 16;

const list = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** The Intake Agent chat's env, or why it is off. Never fatal: the rest of the API still boots. */
export type IntakeChatEnv =
  | { llm: LlmConfig; maxTurns?: number; sessionsPerHour?: number; production: boolean }
  | { unavailable: string };

export interface ResolvedEnv {
  databaseUrl: string;
  config: ApiConfig;
  notify: NotifyOptions;
  outbox: OutboxSender;
  /** Vercel Blob tokens, set when the stores are connected to the project. */
  files: FileStoreConfig;
  /** Set: the intake and promo agents run in the API after a form, a status change or a draft request. */
  anthropicApiKey?: string;
  intakeChat: IntakeChatEnv;
  inboundMail?: InboundMailOptions;
  /** The GitHub App contributors sign in with (GITHUB_APP_CLIENT_ID / _SECRET, via @nw/config). */
  githubApp?: { clientId: string; clientSecret: string };
}

/**
 * LLM_PROVIDER (anthropic | openai-compatible | mock; default anthropic), ANTHROPIC_API_KEY,
 * LLM_API_KEY, LLM_MODEL, LLM_BASE_URL, LLM_MAX_OUTPUT_TOKENS, INTAKE_MAX_TURNS,
 * INTAKE_SESSIONS_PER_HOUR. A missing key or a bad value switches the chat off (503) with
 * the reason, instead of failing the whole API.
 */
export function readIntakeChatEnv(get: (key: string) => string | undefined, production: boolean): IntakeChatEnv {
  const provider = get("LLM_PROVIDER") ?? "anthropic";
  if (!isLlmProviderName(provider)) {
    return { unavailable: `LLM_PROVIDER must be one of ${LLM_PROVIDERS.join(", ")}` };
  }
  const int = (key: string) => {
    const raw = get(key);
    if (raw === undefined) return { value: undefined };
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? { value } : { error: `${key} must be a positive integer` };
  };
  const maxTokens = int("LLM_MAX_OUTPUT_TOKENS");
  const maxTurns = int("INTAKE_MAX_TURNS");
  const perHour = int("INTAKE_SESSIONS_PER_HOUR");
  const bad = [maxTokens, maxTurns, perHour].flatMap((r) => ("error" in r ? [r.error] : []));
  if (bad.length) return { unavailable: bad.join("; ") };

  // The provider's own key first; LLM_API_KEY is the generic fallback.
  const apiKey = provider === "anthropic" ? (get("ANTHROPIC_API_KEY") ?? get("LLM_API_KEY")) : get("LLM_API_KEY");
  try {
    const llm = resolveLlmConfig({
      provider,
      model: get("LLM_MODEL"),
      baseURL: get("LLM_BASE_URL"),
      apiKey,
      maxOutputTokens: "value" in maxTokens ? maxTokens.value : undefined,
    });
    return {
      llm,
      production,
      ...("value" in maxTurns && maxTurns.value ? { maxTurns: maxTurns.value } : {}),
      ...("value" in perHour && perHour.value ? { sessionsPerHour: perHour.value } : {}),
    };
  } catch (err) {
    if (!(err instanceof LlmConfigError)) throw err;
    const keyHint =
      provider === "anthropic" ? "set ANTHROPIC_API_KEY (or LLM_API_KEY)" : "set LLM_API_KEY, LLM_MODEL and LLM_BASE_URL";
    return { unavailable: `${err.message}: ${keyHint}, or LLM_PROVIDER=mock for local development` };
  }
}

/** Turns the resolved env into the routes' deps: a provider, or the reason for 503. */
export function intakeChatDeps(env: IntakeChatEnv): IntakeChatDeps {
  if ("unavailable" in env) return env;
  return {
    provider: createProvider(env.llm, { mockDemo: intakeMockStep }),
    ...(env.maxTurns ? { maxTurns: env.maxTurns } : {}),
    ...(env.sessionsPerHour ? { sessionsPerHour: env.sessionsPerHour } : {}),
    // Chat text is personal data: in production, log only steps, tokens and timings.
    hooks: [createConsoleLogHook({ content: !env.production })],
  };
}

/** The admin assistant runs on the same LLM settings as the Intake Agent, or is off with it. */
export function adminChatDeps(env: IntakeChatEnv): AdminChatDeps {
  if ("unavailable" in env) return env;
  return {
    provider: createProvider(env.llm, { mockDemo: adminMockStep }),
    hooks: [createConsoleLogHook({ content: !env.production })],
  };
}

/** Validate env once at boot. Throws one error naming every problem. */
export function readEnv(env: EnvSource): ResolvedEnv {
  const get = (key: string) => {
    const value = env[key]?.trim();
    return value ? value : undefined;
  };
  const problems: string[] = [];
  const required = (key: string) => {
    const value = get(key);
    if (!value) problems.push(`${key} is required`);
    return value ?? "";
  };

  const databaseUrl = required("DATABASE_URL");
  const googleClientId = required("GOOGLE_CLIENT_ID");
  const sessionSecret = required("SESSION_SECRET");
  if (sessionSecret && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }
  const revalidateUrl = get("WEB_REVALIDATE_URL");
  const revalidateSecret = get("WEB_REVALIDATE_SECRET");
  if (Boolean(revalidateUrl) !== Boolean(revalidateSecret)) {
    problems.push("Set both WEB_REVALIDATE_URL and WEB_REVALIDATE_SECRET, or neither");
  }
  const cronSecret = get("CRON_SECRET");
  if (cronSecret && cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    problems.push(`CRON_SECRET must be at least ${MIN_CRON_SECRET_LENGTH} characters`);
  }
  const devLogin = get("DEV_LOGIN") === "true";
  const production = Boolean(get("VERCEL")) || get("NODE_ENV") === "production";
  if (devLogin && production) {
    problems.push("DEV_LOGIN is for local development only and must not be set in production");
  }
  const inbound = INBOUND_MAIL_KEYS.map(get);
  const [webhookSecret, receivingKey, slackWebhookUrl] = inbound;
  if (inbound.some(Boolean) && !inbound.every(Boolean)) {
    problems.push(`Set all of ${INBOUND_MAIL_KEYS.join(", ")}, or none`);
  }
  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    problems.push("RESEND_WEBHOOK_SECRET is the webhook's signing secret and starts with whsec_");
  }
  if (slackWebhookUrl && !slackWebhookUrl.startsWith("https://hooks.slack.com/")) {
    problems.push("SLACK_INBOX_WEBHOOK_URL must be a Slack incoming webhook (https://hooks.slack.com/…)");
  }
  const origin = (key: "PUBLIC_API_URL" | "PUBLIC_WEB_URL") => {
    const value = get(key) ?? ENV_DEFAULTS[key];
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // reported below
    }
    problems.push(`${key} must be an http(s) origin, e.g. ${ENV_DEFAULTS[key]}`);
    return "";
  };
  const publicUrls = { apiUrl: origin("PUBLIC_API_URL"), webUrl: origin("PUBLIC_WEB_URL") };
  // Contributor sign-in with GitHub: both or neither. Without them it answers 503 (email still works).
  const githubVars = requiredVars(["githubApp"]);
  const githubSet = githubVars.filter((key) => get(key));
  if (githubSet.length && githubSet.length < githubVars.length) problems.push(`Set all of ${githubVars.join(", ")}, or none`);
  const contributorOrigins = get("CONTRIBUTOR_ORIGINS");
  if (problems.length) throw new Error(`@nw/api env: ${problems.join("; ")}`);

  const resendApiKey = get("RESEND_API_KEY");
  const anthropicApiKey = get("ANTHROPIC_API_KEY");
  return {
    databaseUrl,
    config: {
      allowedOrigins: list(get("ALLOWED_ORIGINS") ?? ENV_DEFAULTS.ALLOWED_ORIGINS),
      adminOrigins: list(get("ADMIN_ORIGINS") ?? ENV_DEFAULTS.ADMIN_ORIGINS),
      ...(contributorOrigins ? { contributorOrigins: list(contributorOrigins) } : {}),
      googleClientId,
      sessionSecret,
      ...(devLogin ? { devLogin } : {}),
      ...(revalidateUrl && revalidateSecret
        ? { webRevalidate: { url: revalidateUrl, secret: revalidateSecret } }
        : {}),
      ...(cronSecret ? { cronSecret } : {}),
      publicUrls,
    },
    notify: {
      from: get("NOTIFY_FROM") ?? ENV_DEFAULTS.NOTIFY_FROM,
      to: get("NOTIFY_TO") ?? ENV_DEFAULTS.NOTIFY_TO,
      ...(resendApiKey ? { resendApiKey } : {}),
    },
    files: {
      ...(get("BLOB_PUBLIC_READ_WRITE_TOKEN") ? { publicToken: get("BLOB_PUBLIC_READ_WRITE_TOKEN") } : {}),
      ...(get("BLOB_PRIVATE_READ_WRITE_TOKEN") ? { privateToken: get("BLOB_PRIVATE_READ_WRITE_TOKEN") } : {}),
    },
    // Approved outbox emails go out from the same address; replies land in our inbox.
    outbox: {
      from: get("NOTIFY_FROM") ?? ENV_DEFAULTS.NOTIFY_FROM,
      ...(resendApiKey ? { resendApiKey } : {}),
    },
    ...(anthropicApiKey ? { anthropicApiKey } : {}),
    intakeChat: readIntakeChatEnv(get, production),
    ...(webhookSecret && receivingKey && slackWebhookUrl
      ? {
          inboundMail: {
            webhookSecret,
            resendApiKey: receivingKey,
            slackWebhookUrl,
            listId: get("INBOUND_LIST_ID") ?? ENV_DEFAULTS.INBOUND_LIST_ID,
          },
        }
      : {}),
    ...(githubSet.length ? { githubApp: loadConfig(["githubApp"], env).githubApp } : {}),
  };
}

/** Production deps: a lazy node-postgres pool and `notifyTeam` via Resend (or console). */
export function depsFromEnv(env: EnvSource): AppDeps {
  const { databaseUrl, config, notify, outbox, files, anthropicApiKey, intakeChat, inboundMail, githubApp } = readEnv(env);
  const production = Boolean(env.VERCEL?.trim()) || env.NODE_ENV === "production";
  const db = createDb(databaseUrl);
  const agents = anthropicApiKey ? { db, claude: { apiKey: anthropicApiKey }, logger: console } : undefined;
  const triggerIntake: IntakeTrigger | undefined = agents && inProcessIntakeTrigger(agents);
  const triggerPromo: PromoTrigger | undefined = agents && inProcessPromoTrigger(agents);
  const draftPromo = agents && inProcessPromoRunner(agents);
  return {
    db,
    env: config,
    notify: (message) => notifyTeam(message, notify),
    outbox,
    ...(triggerIntake ? { triggerIntake } : {}),
    ...(triggerPromo ? { triggerPromo } : {}),
    ...(draftPromo ? { draftPost: (postId: string) => draftPromo({ postId }) } : {}),
    intakeChat: intakeChatDeps(intakeChat),
    adminChat: adminChatDeps(intakeChat),
    files: new BlobFiles(files),
    // Sign-in codes (members and contributors) go out through Resend. Locally without a key they are printed to the console;
    // in production without a key, signing in by email is off (Google still works).
    ...(outbox.resendApiKey || !production
      ? {
          sendSignInCode: (to: string, code: string) =>
            sendSignInCode(to, code, { from: outbox.from, ...(outbox.resendApiKey ? { resendApiKey: outbox.resendApiKey } : {}) }),
          sendContributorSignInCode: (to: string, code: string) =>
            sendSignInCode(to, code, {
              from: outbox.from,
              audience: "contributor",
              ...(outbox.resendApiKey ? { resendApiKey: outbox.resendApiKey } : {}),
            }),
        }
      : {}),
    // Newsletter confirmations: the same rule as sign-in codes.
    ...(outbox.resendApiKey || !production
      ? {
          sendNewsletterConfirmation: (to: string, confirmUrl: string) =>
            sendNewsletterConfirmation(to, confirmUrl, {
              from: outbox.from,
              ...(outbox.resendApiKey ? { resendApiKey: outbox.resendApiKey } : {}),
            }),
        }
      : {}),
    ...(inboundMail ? { inboundMail } : {}),
    ...(githubApp ? { githubOAuth: createGitHubOAuth(githubApp) } : {}),
  };
}
