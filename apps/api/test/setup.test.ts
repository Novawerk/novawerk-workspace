// Wiring checks that don't need a database: env parsing, the Vercel deployment, and that
// the status lists in @nw/contracts match the enums in @nw/db.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  APPLICATION_STATUSES,
  DOCUMENT_KINDS,
  LEDGER_DIRECTIONS,
  OUTBOX_STATUSES,
  PARTNER_STAGES,
  POST_KINDS,
  POST_STATUSES,
  PROJECT_STATUSES,
  PUBLIC_PROJECT_STATUSES,
  SUBMISSION_STATUSES,
} from "@nw/contracts";
import {
  PUBLIC_PROJECT_STATUSES as DB_PUBLIC_STATUSES,
  postKind,
  postStatus,
  applicationStatus,
  documentKind,
  ledgerDirection,
  outboxStatus,
  partnerStage,
  projectStatus,
  submissionStatus,
} from "@nw/db";

import { AnthropicProvider, MockProvider } from "@nw/agent-harness";

import { ENV_DEFAULTS, adminChatDeps, depsFromEnv, intakeChatDeps, readEnv, readIntakeChatEnv } from "../src/deps.js";

describe("readEnv", () => {
  const required = {
    DATABASE_URL: "postgres://localhost/nw",
    GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    SESSION_SECRET: "x".repeat(32),
  };

  it("applies the defaults", () => {
    const { config, notify, databaseUrl } = readEnv(required);
    expect(databaseUrl).toBe(required.DATABASE_URL);
    expect(config.allowedOrigins).toEqual(ENV_DEFAULTS.ALLOWED_ORIGINS.split(","));
    expect(config.adminOrigins).toEqual(["https://admin.novawerk.io", "http://localhost:5173"]);
    expect(config.webRevalidate).toBeUndefined();
    expect(notify).toEqual({ from: "Novawerk <info@novawerk.io>", to: "info@novawerk.io" });
  });

  it("reads the Blob store tokens when they are set", () => {
    expect(readEnv(required).files).toEqual({});
    expect(
      readEnv({ ...required, BLOB_PUBLIC_READ_WRITE_TOKEN: "pub", BLOB_PRIVATE_READ_WRITE_TOKEN: "priv" }).files,
    ).toEqual({ publicToken: "pub", privateToken: "priv" });
  });

  it("sends approved outbox emails from the notify sender, with the Resend key when set", () => {
    expect(readEnv(required).outbox).toEqual({ from: "Novawerk <info@novawerk.io>" });
    expect(readEnv({ ...required, RESEND_API_KEY: "re_x", NOTIFY_FROM: "Team <hi@novawerk.io>" }).outbox).toEqual({
      from: "Team <hi@novawerk.io>",
      resendApiKey: "re_x",
    });
  });

  it("parses comma lists and optional values", () => {
    const { config, notify } = readEnv({
      ...required,
      ALLOWED_ORIGINS: " https://a.example , https://b.example,",
      RESEND_API_KEY: "re_test",
      WEB_REVALIDATE_URL: "https://novawerk.io/api/revalidate",
      WEB_REVALIDATE_SECRET: "s",
    });
    expect(config.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(config.webRevalidate).toEqual({ url: "https://novawerk.io/api/revalidate", secret: "s" });
    expect(notify.resendApiKey).toBe("re_test");
  });

  it("relays info@ mail to Slack only with all three inbound settings", () => {
    const inbound = {
      RESEND_WEBHOOK_SECRET: "whsec_c2VjcmV0",
      RESEND_RECEIVING_API_KEY: "re_full",
      SLACK_INBOX_WEBHOOK_URL: "https://hooks.slack.com/services/T/B/x",
    };
    expect(readEnv(required).inboundMail).toBeUndefined();
    expect(readEnv({ ...required, ...inbound }).inboundMail).toEqual({
      webhookSecret: "whsec_c2VjcmV0",
      resendApiKey: "re_full",
      slackWebhookUrl: "https://hooks.slack.com/services/T/B/x",
      listId: "info.novawerk.io",
    });
    expect(depsFromEnv({ ...required, ...inbound, INBOUND_LIST_ID: "hi.novawerk.io" }).inboundMail?.listId).toBe(
      "hi.novawerk.io",
    );
    expect(() => readEnv({ ...required, SLACK_INBOX_WEBHOOK_URL: inbound.SLACK_INBOX_WEBHOOK_URL })).toThrow(
      /Set all of RESEND_WEBHOOK_SECRET, RESEND_RECEIVING_API_KEY, SLACK_INBOX_WEBHOOK_URL, or none/,
    );
    expect(() =>
      readEnv({ ...required, ...inbound, RESEND_WEBHOOK_SECRET: "c2VjcmV0", SLACK_INBOX_WEBHOOK_URL: "https://x" }),
    ).toThrow(/starts with whsec_; SLACK_INBOX_WEBHOOK_URL must be a Slack incoming webhook/);
  });

  it("points newsletter links at the public origins", () => {
    expect(readEnv(required).config.publicUrls).toEqual({ apiUrl: "https://api.novawerk.io", webUrl: "https://novawerk.io" });
    expect(
      readEnv({ ...required, PUBLIC_API_URL: "http://localhost:8787/", PUBLIC_WEB_URL: "http://localhost:3000" }).config.publicUrls,
    ).toEqual({ apiUrl: "http://localhost:8787", webUrl: "http://localhost:3000" });
    expect(() => readEnv({ ...required, PUBLIC_WEB_URL: "javascript:alert(1)" })).toThrow(/PUBLIC_WEB_URL must be an http\(s\) origin/);
  });

  it("sends newsletter confirmations like sign-in codes: off in production without a Resend key", () => {
    const prod = { ...required, VERCEL: "1" };
    expect(depsFromEnv(prod).sendNewsletterConfirmation).toBeUndefined();
    expect(depsFromEnv({ ...prod, RESEND_API_KEY: "re_x" }).sendNewsletterConfirmation).toBeTypeOf("function");
    expect(depsFromEnv(required).sendNewsletterConfirmation).toBeTypeOf("function");
  });

  it("names every missing or invalid variable at once", () => {
    expect(() => readEnv({ ...required, CRON_SECRET: "short" })).toThrow(/CRON_SECRET must be at least 16 characters/);
    expect(readEnv({ ...required, CRON_SECRET: "c".repeat(16) }).config.cronSecret).toBe("c".repeat(16));
    expect(() => readEnv({ SESSION_SECRET: "short", WEB_REVALIDATE_URL: "https://x" })).toThrow(
      /DATABASE_URL is required; GOOGLE_CLIENT_ID is required; SESSION_SECRET must be at least 32 characters; Set both WEB_REVALIDATE_URL/,
    );
  });
});

describe("readIntakeChatEnv", () => {
  const read = (env: Record<string, string>, production = false) =>
    readIntakeChatEnv((key) => env[key]?.trim() || undefined, production);

  it("defaults to Claude and switches off (not crashes) without a key", () => {
    const off = read({});
    expect(off).toEqual({
      unavailable: expect.stringMatching(/needs an API key: set ANTHROPIC_API_KEY \(or LLM_API_KEY\), or LLM_PROVIDER=mock/),
    });
    expect(intakeChatDeps(off)).toBe(off);
  });

  it("builds a Claude provider from ANTHROPIC_API_KEY, with LLM_API_KEY as fallback", () => {
    const on = read({ ANTHROPIC_API_KEY: "sk-ant", INTAKE_MAX_TURNS: "12" });
    expect(on).toMatchObject({
      llm: { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant" },
      maxTurns: 12,
    });
    expect(read({ LLM_API_KEY: "sk-any" })).toMatchObject({ llm: { apiKey: "sk-any" } });
    const deps = intakeChatDeps(on);
    expect("provider" in deps && deps.provider).toBeInstanceOf(AnthropicProvider);
    expect("provider" in deps && deps.maxTurns).toBe(12);
  });

  it("needs model and base URL for openai-compatible", () => {
    expect(read({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "k" })).toEqual({
      unavailable: expect.stringContaining("needs a model name, a base URL"),
    });
    expect(
      read({ LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "k", LLM_MODEL: "qwen-plus", LLM_BASE_URL: "https://x/v1" }),
    ).toMatchObject({ llm: { provider: "openai-compatible", model: "qwen-plus", baseURL: "https://x/v1" } });
  });

  it("runs the mock without a key", () => {
    const deps = intakeChatDeps(read({ LLM_PROVIDER: "mock" }));
    expect("provider" in deps && deps.provider).toBeInstanceOf(MockProvider);
  });

  it("gives the admin assistant the same model settings, or switches it off with the chat", () => {
    const on = adminChatDeps(read({ ANTHROPIC_API_KEY: "sk-ant" }));
    expect("provider" in on && on.provider).toBeInstanceOf(AnthropicProvider);
    expect(adminChatDeps(read({}))).toHaveProperty("unavailable");
    const deps = depsFromEnv({
      DATABASE_URL: "postgres://localhost/nw",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      SESSION_SECRET: "x".repeat(32),
      LLM_PROVIDER: "mock",
    });
    expect(deps.adminChat && "provider" in deps.adminChat && deps.adminChat.provider).toBeInstanceOf(MockProvider);
  });

  it("switches off on bad values instead of throwing", () => {
    expect(read({ LLM_PROVIDER: "claude" })).toEqual({ unavailable: expect.stringContaining("LLM_PROVIDER must be one of") });
    expect(read({ LLM_PROVIDER: "mock", INTAKE_MAX_TURNS: "lots" })).toEqual({
      unavailable: "INTAKE_MAX_TURNS must be a positive integer",
    });
  });

  it("is part of readEnv, which still boots without any LLM settings", () => {
    const { intakeChat } = readEnv({
      DATABASE_URL: "postgres://localhost/nw",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      SESSION_SECRET: "x".repeat(32),
    });
    expect(intakeChat).toHaveProperty("unavailable");
  });
});

describe("Vercel deployment", () => {
  const read = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

  it("serves the tsup bundle of src/index.ts from api/index.js, prompts and promo's knowledge included", () => {
    const vercel = JSON.parse(read("vercel.json"));
    expect(vercel).toMatchObject({ framework: null, buildCommand: "pnpm build", regions: ["fra1"] });
    expect(vercel.rewrites).toEqual([{ source: "/(.*)", destination: "/api" }]);
    expect(vercel.functions["api/index.js"].includeFiles).toBe("dist/{prompts,knowledge}/**");
    expect(read("tsup.config.ts")).toMatch(/dist\/knowledge/);
    expect(read("api/index.js")).toMatch(/from "\.\.\/dist\/index\.js"/);
    expect(read("tsup.config.ts")).toMatch(/entry: \[[^\]]*"src\/index\.ts"/);
    expect(read("src/index.ts")).toMatch(/^export default app;$/m);
  });

  it("runs the cleanups and the GitHub sync every day", () => {
    expect(JSON.parse(read("vercel.json")).crons).toEqual([
      { path: "/cron/intake-cleanup", schedule: "0 3 * * *" },
      { path: "/cron/analytics-cleanup", schedule: "15 3 * * *" },
      { path: "/cron/resume-cleanup", schedule: "30 3 * * *" },
      { path: "/cron/sign-in-cleanup", schedule: "45 3 * * *" },
      { path: "/cron/github-sync", schedule: "0 4 * * *" },
    ]);
  });
});

describe("status lists", () => {
  it("match the database enums", () => {
    expect([...SUBMISSION_STATUSES]).toEqual(submissionStatus.enumValues);
    expect([...APPLICATION_STATUSES]).toEqual(applicationStatus.enumValues);
    expect([...PUBLIC_PROJECT_STATUSES]).toEqual([...DB_PUBLIC_STATUSES]);
    expect([...PROJECT_STATUSES]).toEqual(projectStatus.enumValues);
    expect([...OUTBOX_STATUSES]).toEqual(outboxStatus.enumValues);
    expect([...PARTNER_STAGES]).toEqual(partnerStage.enumValues);
    expect([...LEDGER_DIRECTIONS]).toEqual(ledgerDirection.enumValues);
    expect([...DOCUMENT_KINDS]).toEqual(documentKind.enumValues);
    expect([...POST_KINDS]).toEqual(postKind.enumValues);
    expect([...POST_STATUSES]).toEqual(postStatus.enumValues);
  });
});
