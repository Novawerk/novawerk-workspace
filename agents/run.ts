#!/usr/bin/env tsx
// Run one agent.
//
//   pnpm agent --list
//   pnpm agent <id> --help
//   pnpm agent <id> [--input '<json>'] [--dry-run]
//
// GitHub Actions calls this from .github/workflows/agent-<id>.yml. Locally it loads the repo's
// .env (unless --dry-run, which needs no secrets and touches nothing outside this process).

import { appendFile, access, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { runAgent, type AgentTrigger, type AnyAgent } from "@nw/agent-core";
import { ConfigError, requiredVars } from "@nw/config";
import { prettifyError, ZodError } from "zod";

const AGENTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(AGENTS_DIR, "..");

/** Every folder in agents/ with an index.ts is an agent. */
export async function listAgentIds(): Promise<string[]> {
  const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "lib" || e.name === "node_modules") continue;
    const exists = await access(join(AGENTS_DIR, e.name, "index.ts")).then(() => true, () => false);
    if (exists) ids.push(e.name);
  }
  return ids.sort();
}

export async function loadAgent(id: string): Promise<AnyAgent> {
  const ids = await listAgentIds();
  if (!ids.includes(id)) throw new Error(`Unknown agent "${id}". Known: ${ids.join(", ")}`);
  const mod = (await import(pathToFileURL(join(AGENTS_DIR, id, "index.ts")).href)) as { default?: AnyAgent };
  if (!mod.default || mod.default.id !== id) throw new Error(`agents/${id}/index.ts must default-export defineAgent({ id: "${id}", ... })`);
  return mod.default;
}

function describeTrigger(t: AgentTrigger): string {
  switch (t.kind) {
    case "cron":
      return `cron "${t.schedule}" (UTC)${t.note ? ` — ${t.note}` : ""}`;
    case "dispatch":
      return `repository_dispatch "${t.event}"`;
    case "manual":
      return "workflow_dispatch (Run workflow button)";
  }
}

export function helpText(agent: AnyAgent): string {
  return [
    `${agent.id} — ${agent.description}`,
    "",
    `Usage:    pnpm agent ${agent.id} [--input '<json>'] [--dry-run]`,
    `Example:  pnpm agent ${agent.id} --input '${JSON.stringify(agent.exampleInput ?? {})}'`,
    "",
    `Triggers: ${agent.triggers.map(describeTrigger).join("\n          ")}`,
    `Secrets:  ${requiredVars(agent.needs).join(", ") || "(none)"}`,
    `Effects:  ${agent.effects.join("\n          ")}`,
    `Records:  ${agent.writesRecords ? "writes records/ (the workflow commits them)" : "no"}`,
    `Workflow: .github/workflows/agent-${agent.id}.yml`,
    "",
    "--dry-run uses fake services: no secrets, no network, no real database, nothing written.",
  ].join("\n");
}

const USAGE = "Usage: pnpm agent <id> [--input '<json>'] [--dry-run] | pnpm agent <id> --help | pnpm agent --list";

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      input: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      list: { type: "boolean", default: false },
    },
  });
  const id = positionals[0];

  if (values.list || (!id && !values.help)) {
    const agents = await Promise.all((await listAgentIds()).map(loadAgent));
    console.log(agents.map((a) => `${a.id.padEnd(20)} ${a.description}`).join("\n"));
    if (!values.list) console.log(`\n${USAGE}`);
    return values.list ? 0 : 1;
  }
  if (!id) {
    console.log(USAGE);
    return 0;
  }

  const agent = await loadAgent(id);
  if (values.help) {
    console.log(helpText(agent));
    return 0;
  }

  const dryRun = values["dry-run"];
  let input: unknown;
  if (values.input !== undefined && values.input.trim() !== "") {
    try {
      input = JSON.parse(values.input);
    } catch {
      throw new Error(`--input is not valid JSON: ${values.input}`);
    }
  } else if (dryRun) {
    input = agent.dryRunInput ?? agent.exampleInput;
  }
  // GitHub passes an empty object for events without a payload (e.g. cron): treat as no input.
  if (input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) input = undefined;

  if (!dryRun) {
    const envFile = join(REPO_ROOT, ".env");
    if (await access(envFile).then(() => true, () => false)) process.loadEnvFile(envFile);
  }

  const started = Date.now();
  const output = await runAgent(agent, { input, dryRun, repoRoot: REPO_ROOT });
  const json = JSON.stringify(output, null, 2);
  console.log(`[${agent.id}] done in ${((Date.now() - started) / 1000).toFixed(1)}s${dryRun ? " (dry run)" : ""}\n${json}`);

  // Show the result on the Actions run page.
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile) await appendFile(summaryFile, `### ${agent.id}\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  return 0;
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      if (err instanceof ConfigError) console.error(err.message);
      else if (err instanceof ZodError) console.error(`Invalid --input:\n${prettifyError(err)}`);
      else console.error(err instanceof Error ? (err.stack ?? err.message) : err);
      process.exit(1);
    },
  );
}
