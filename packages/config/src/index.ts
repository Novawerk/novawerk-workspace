// @nw/config — the ONLY module in shared packages that reads process.env.
//
// Each caller asks only for the sections it needs:
//
//   const cfg = loadConfig(["anthropic", "database"]);
//   cfg.anthropic.apiKey; cfg.database.url;   // typed
//   cfg.jira;                                 // type error: not requested
//
// It fails fast with one error that lists every missing variable across the requested
// sections. In production the values come from GitHub Actions secrets (agents) or the
// hosting platform's env (apps); locally from `.env`.

export interface AppConfig {
  anthropic: { apiKey: string };
  jira: { baseUrl: string; email: string; apiToken: string };
  email: { resendApiKey: string; from: string };
  database: { url: string };
  /** Vercel Blob stores: public (project images) and private (documents). See @nw/object-store. */
  files: { publicToken: string; privateToken: string };
}

export type ConfigSection = keyof AppConfig;

/** The config subset for a list of sections. */
export type ConfigFor<S extends readonly ConfigSection[]> = Pick<AppConfig, S[number]>;

type Env = Record<string, string | undefined>;

/** Which env vars each section needs, and how to build it once they are present. */
const SECTIONS: { [K in ConfigSection]: { vars: readonly string[]; build: (v: Record<string, string>) => AppConfig[K] } } = {
  anthropic: {
    vars: ["ANTHROPIC_API_KEY"],
    build: (v) => ({ apiKey: v["ANTHROPIC_API_KEY"]! }),
  },
  jira: {
    vars: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    build: (v) => ({ baseUrl: v["JIRA_BASE_URL"]!, email: v["JIRA_EMAIL"]!, apiToken: v["JIRA_API_TOKEN"]! }),
  },
  email: {
    vars: ["RESEND_API_KEY", "EMAIL_FROM"],
    build: (v) => ({ resendApiKey: v["RESEND_API_KEY"]!, from: v["EMAIL_FROM"]! }),
  },
  database: {
    vars: ["DATABASE_URL"],
    build: (v) => ({ url: v["DATABASE_URL"]! }),
  },
  files: {
    vars: ["BLOB_PUBLIC_READ_WRITE_TOKEN", "BLOB_PRIVATE_READ_WRITE_TOKEN"],
    build: (v) => ({
      publicToken: v["BLOB_PUBLIC_READ_WRITE_TOKEN"]!,
      privateToken: v["BLOB_PRIVATE_READ_WRITE_TOKEN"]!,
    }),
  },
};

export class ConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Locally, copy .env.example to .env and fill them in. In GitHub Actions, add them as ` +
        `repository secrets and pass them to the job's env.`,
    );
    this.name = "ConfigError";
  }
}

/** The env var names a list of sections needs — used by docs, workflows and the agent runner. */
export function requiredVars(sections: readonly ConfigSection[]): string[] {
  return [...new Set(sections.flatMap((s) => SECTIONS[s].vars))];
}

/**
 * Load and validate only the requested sections. Throws a ConfigError listing every missing
 * (or empty) variable across all of them, so you fix the env in one go.
 */
export function loadConfig<const S extends readonly ConfigSection[]>(
  sections: S,
  env: Env = process.env,
): ConfigFor<S> {
  const missing: string[] = [];
  const values: Record<string, string> = {};
  for (const key of requiredVars(sections)) {
    const value = env[key];
    if (value === undefined || value.trim() === "") missing.push(key);
    else values[key] = value;
  }
  if (missing.length > 0) throw new ConfigError(missing);

  const out: Partial<AppConfig> = {};
  for (const section of sections) {
    (out as Record<ConfigSection, unknown>)[section] = SECTIONS[section].build(values);
  }
  return out as ConfigFor<S>;
}
