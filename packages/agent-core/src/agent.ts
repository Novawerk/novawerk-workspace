// defineAgent() and runAgent(): the shared shape every agent in agents/<id>/index.ts uses.
//
// An agent declares the secrets it needs (`needs`), how to build its real services from that
// config, how to build fakes for a dry run, and a `run` that only talks to those services.
// The GitHub Actions workflow decides WHEN it runs; this decides WHAT it can touch.

import { loadConfig, type ConfigFor, type ConfigSection } from "@nw/config";

export type AgentTrigger =
  /** GitHub Actions `schedule` (UTC cron). */
  | { kind: "cron"; schedule: string; note?: string }
  /** GitHub Actions `repository_dispatch` with this event type. */
  | { kind: "dispatch"; event: string }
  /** GitHub Actions `workflow_dispatch` (the "Run workflow" button) and `pnpm agent`. */
  | { kind: "manual" };

export interface AgentContext {
  /** A progress line. Shows in the Actions log. */
  log: (message: string) => void;
  /** True for `--dry-run`: fake services, no secrets, nothing leaves the machine. */
  dryRun: boolean;
  /** Absolute path of the monorepo root (records/ and knowledge/ live here). */
  repoRoot: string;
  /** "Now" for this run. Injected so runs are reproducible in tests. */
  now: Date;
}

/** Services may hold connections; give them a `close()` and the runner calls it when the run ends. */
export interface Closable {
  close?: () => Promise<void>;
}

/** Anything an agent's run talks to: a database, Claude, Jira, the record store… */
export type Services = object;

export interface AgentDefinition<Needs extends readonly ConfigSection[], Input, S extends Services, Output> {
  /** kebab id — matches agents/<id>/ and .github/workflows/agent-<id>.yml. */
  id: string;
  /** One sentence: what it does. */
  description: string;
  triggers: AgentTrigger[];
  /** Config sections (and so secrets) this agent may use. Nothing else is loaded. */
  needs: Needs;
  /** What it changes in the world, in plain words. Shown by `--help`. */
  effects: string[];
  /** True when it writes files under records/ that the workflow commits. */
  writesRecords?: boolean;
  /** Example input for `--help`. */
  exampleInput?: unknown;
  /** Input for `--dry-run` when none is given. Defaults to `exampleInput`. */
  dryRunInput?: unknown;
  /** Validate the `--input` JSON (undefined when none was given). */
  parseInput: (raw: unknown) => Input;
  /** Build real services from the loaded config. */
  services: (config: ConfigFor<Needs>, ctx: AgentContext) => S | Promise<S>;
  /** Build fakes for a dry run: no network, no real database, no secrets. */
  dryRunServices: (ctx: AgentContext) => S | Promise<S>;
  /** The agent's work. Only touches `services`. */
  run: (input: Input, services: S, ctx: AgentContext) => Promise<Output>;
}

/** Any agent, for registries and the runner. */
export type AnyAgent = AgentDefinition<readonly ConfigSection[], any, any, unknown>;

export function defineAgent<const Needs extends readonly ConfigSection[], Input, S extends Services, Output>(
  def: AgentDefinition<Needs, Input, S, Output>,
): AgentDefinition<Needs, Input, S, Output> {
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) throw new Error(`defineAgent(): "${def.id}" is not a kebab id.`);
  return def;
}

export interface RunAgentOptions {
  /** Parsed `--input` JSON, or undefined. */
  input?: unknown;
  dryRun?: boolean;
  repoRoot: string;
  /** Env to load secrets from. Defaults to process.env (read by @nw/config, not here). */
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  now?: Date;
}

/**
 * Run one agent: validate input, load ONLY the config it declared (or build dry-run fakes),
 * run it, and always close its services.
 */
export async function runAgent<Needs extends readonly ConfigSection[], Input, S extends Services, Output>(
  def: AgentDefinition<Needs, Input, S, Output>,
  opts: RunAgentOptions,
): Promise<Output> {
  const ctx: AgentContext = {
    log: opts.log ?? ((m) => console.log(`[${def.id}] ${m}`)),
    dryRun: opts.dryRun ?? false,
    repoRoot: opts.repoRoot,
    now: opts.now ?? new Date(),
  };
  const input = def.parseInput(opts.input);
  const services = ctx.dryRun
    ? await def.dryRunServices(ctx)
    : await def.services(loadConfig(def.needs, opts.env), ctx);
  try {
    return await def.run(input, services, ctx);
  } finally {
    await (services as Closable).close?.();
  }
}
