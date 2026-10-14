// Tests config validation. @nw/config is the ONLY module in shared packages that reads env.
// Each caller asks for just the sections it needs, and it must fail fast with a clear,
// complete list when one of THOSE is missing — not crash later, deep in an agent run.

import { describe, expect, expectTypeOf, it } from "vitest";
import { ConfigError, loadConfig, requiredVars } from "./index.js";

const FULL_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "sk-ant-x",
  JIRA_BASE_URL: "https://novawerk-teams.atlassian.net",
  JIRA_EMAIL: "info@novawerk.io",
  JIRA_API_TOKEN: "jira-x",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "Novawerk <info@novawerk.io>",
  DATABASE_URL: "postgres://localhost/nw",
  BLOB_PUBLIC_READ_WRITE_TOKEN: "pub",
  BLOB_PRIVATE_READ_WRITE_TOKEN: "priv",
};

function errorOf(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (e) {
    return e as ConfigError;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("returns only the requested sections, typed", () => {
    const cfg = loadConfig(["anthropic", "database"], { ...FULL_ENV });
    expect(cfg).toEqual({
      anthropic: { apiKey: "sk-ant-x" },
      database: { url: "postgres://localhost/nw" },
    });
    expectTypeOf(cfg).toEqualTypeOf<{
      anthropic: { apiKey: string };
      database: { url: string };
    }>();
  });

  it("builds every section from a complete env", () => {
    const cfg = loadConfig(["anthropic", "jira", "email", "database", "files"], { ...FULL_ENV });
    expect(cfg.jira.baseUrl).toBe(FULL_ENV.JIRA_BASE_URL);
    expect(cfg.files.privateToken).toBe("priv");
    expect(cfg.email.from).toBe("Novawerk <info@novawerk.io>");
  });

  it("does not demand secrets for sections nobody asked for", () => {
    // An intake run needs Claude + the database. No Jira, no Resend, no file stores.
    const env = { ANTHROPIC_API_KEY: "sk-ant-x", DATABASE_URL: "postgres://localhost/nw" };
    expect(() => loadConfig(["anthropic", "database"], env)).not.toThrow();
  });

  it("lists every missing var across the requested sections in one error", () => {
    const { BLOB_PRIVATE_READ_WRITE_TOKEN, DATABASE_URL, JIRA_EMAIL, ...partial } = FULL_ENV;
    const err = errorOf(() => loadConfig(["database", "files", "anthropic"], partial));
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.missing).toEqual(["DATABASE_URL", "BLOB_PRIVATE_READ_WRITE_TOKEN"]);
    expect(err.message).toContain("DATABASE_URL");
    expect(err.message).toContain("BLOB_PRIVATE_READ_WRITE_TOKEN");
    // Present vars, and vars of sections not requested (Jira), are not blamed.
    expect(err.message).not.toContain("ANTHROPIC_API_KEY");
    expect(err.message).not.toContain("JIRA_EMAIL");
  });

  it("treats an empty or blank var as missing", () => {
    expect(() => loadConfig(["email"], { ...FULL_ENV, RESEND_API_KEY: "" })).toThrow(/RESEND_API_KEY/);
    expect(() => loadConfig(["email"], { ...FULL_ENV, EMAIL_FROM: "   " })).toThrow(/EMAIL_FROM/);
  });

  it("returns an empty object for no sections", () => {
    expect(loadConfig([], {})).toEqual({});
  });
});

describe("requiredVars", () => {
  it("lists the env var names for a set of sections, deduplicated", () => {
    expect(requiredVars(["anthropic", "database", "anthropic"])).toEqual(["ANTHROPIC_API_KEY", "DATABASE_URL"]);
  });
});
