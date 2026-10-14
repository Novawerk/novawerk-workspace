#!/usr/bin/env tsx
// Scaffold a new agent: writes agents/<id>/index.ts and prints its workflow.
// The workflow lives in the private repo (Novawerk/novawerk/.github/workflows/agent-<id>.yml,
// NB-ADR-0012): it checks out this repo at the root and the private one under ops/.
// Put the real logic in a package under packages/ and call it from the agent.
//
// Usage: pnpm new:agent <kebab-id>

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const exists = (p: string) => access(p).then(() => true, () => false);

function agentSource(id: string): string {
  return `// ${id} — TODO: one sentence on what this agent does and why.
// Keep this file thin: wire config + packages together. Real logic goes in packages/*.
// If it acts on the outside world (email, payments, signatures), it QUEUES for a member's
// approval (e.g. @nw/email queueEmail) — it never acts directly.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";

import { claude, dryClaude } from "../lib/services.js";

const Input = z.object({ note: z.string().optional() }).default({});

export default defineAgent({
  id: "${id}",
  description: "TODO: what it does, in one sentence.",
  triggers: [{ kind: "manual" }, { kind: "cron", schedule: "0 6 * * 1", note: "TODO" }],
  needs: ["anthropic"],
  effects: ["TODO: what it changes in the world"],
  exampleInput: {},
  parseInput: (raw) => Input.parse(raw ?? undefined),
  services: (cfg, ctx) => ({ claude: claude(cfg.anthropic.apiKey, ctx) }),
  dryRunServices: (ctx) => ({ claude: dryClaude(ctx, () => "(dry run) answer") }),
  async run(input, services, ctx) {
    ctx.log("TODO: call into a packages/* function with these services.");
    return { ok: true, input };
  },
});
`;
}

function workflowSource(id: string): string {
  return `name: "Agent: ${id}"

# TODO: what it does. Secrets: only the ones the agent declares in \`needs\`.

on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: read # contents: write + the commit-records step only if it writes records/

concurrency:
  group: agent-${id}
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          repository: Novawerk/novawerk-workspace
      - uses: actions/checkout@v4
        with:
          path: ops
      - uses: ./ops/.github/actions/agent-setup

      - name: pnpm agent ${id}
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: pnpm agent ${id}

      # Only if the agent writes records/ (and then contents: write above):
      # - uses: ./ops/.github/actions/commit-records
      #   with:
      #     message: "${id}: TODO"
`;
}

async function main(): Promise<void> {
  const [, , id] = process.argv;
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || id === "lib") {
    console.error("Usage: pnpm new:agent <kebab-id>");
    process.exit(1);
  }

  const agentPath = join(ROOT, "agents", id, "index.ts");
  if (await exists(agentPath)) {
    console.error(`Refusing to overwrite ${agentPath}`);
    process.exit(1);
  }

  await mkdir(dirname(agentPath), { recursive: true });
  await writeFile(agentPath, agentSource(id), "utf8");

  console.log(`Created agents/${id}/index.ts`);
  console.log("");
  console.log(`Add this workflow to the private repo as Novawerk/novawerk/.github/workflows/agent-${id}.yml:`);
  console.log("");
  console.log(workflowSource(id));
  console.log("Next:");
  console.log("  1. Put the logic in a package under packages/ (with tests) and call it from the agent.");
  console.log("  2. Keep the workflow's schedule and secrets in step with the agent's triggers and needs");
  console.log("     (agents/agents.test.ts checks this in the private repo's agents-check; add the new id to its list).");
  console.log(`  3. Try it: pnpm agent ${id} --dry-run`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
