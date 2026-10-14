// Invariants that tie agents/ to their workflows. The workflows live in the private repo
// (Novawerk/novawerk, NB-ADR-0012), whose CI runs this file with AGENT_WORKFLOWS_DIR pointing at
// them and REQUIRE_AGENT_WORKFLOWS=1. Here, without them, only the agent checks run.
//   - every agent has a workflow that runs it, on the schedule the agent declares;
//   - each workflow passes exactly the secrets the agent declares — and never the Resend key,
//     so no agent can send email, even by mistake;
//   - only agents that write records get `contents: write` and the commit step;
//   - every agent completes a dry run (fake services, no secrets, no network).

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { runAgent } from "@nw/agent-core";
import { requiredVars } from "@nw/config";

import { helpText, listAgentIds, loadAgent } from "./run.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ids = await listAgentIds();

const WORKFLOWS_DIR = process.env.AGENT_WORKFLOWS_DIR ?? join(REPO_ROOT, ".github/workflows");
const workflow = (id: string) => readFile(join(WORKFLOWS_DIR, `agent-${id}.yml`), "utf8");
const haveWorkflows = process.env.REQUIRE_AGENT_WORKFLOWS === "1" || existsSync(join(WORKFLOWS_DIR, `agent-${ids[0]}.yml`));
const withWorkflows = haveWorkflows ? it : it.skip;

describe("agents/", () => {
  it("has the seven agents we run", () => {
    expect(ids).toEqual([
      "all-hands-prep",
      "intake",
      "jira-automation",
      "promo",
      "sponsor-discovery",
      "sponsor-outreach",
      "standup-digest",
    ]);
  });
});

describe.each(ids)("agent %s", (id) => {
  it("default-exports a definition with a matching id and help text", async () => {
    const agent = await loadAgent(id);
    expect(agent.id).toBe(id);
    expect(helpText(agent)).toContain(`pnpm agent ${id}`);
  });

  withWorkflows("has a workflow that runs it with exactly its secrets", async () => {
    const agent = await loadAgent(id);
    const yml = await workflow(id);
    expect(yml).toContain(`pnpm agent ${id}`);

    const secrets = [...new Set([...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]!))].sort();
    expect(secrets).toEqual([...requiredVars(agent.needs)].sort());
    expect(yml).not.toMatch(/RESEND_API_KEY|EMAIL_FROM/);
    expect(yml).not.toMatch(/secrets:\s*inherit/);
  });

  withWorkflows("schedules the cron it declares", async () => {
    const agent = await loadAgent(id);
    const yml = await workflow(id);
    for (const t of agent.triggers) {
      if (t.kind === "cron") expect(yml).toContain(`cron: "${t.schedule}"`);
      if (t.kind === "dispatch") expect(yml).toMatch(new RegExp(`types: \\[${t.event}\\]`));
      if (t.kind === "manual") expect(yml).toContain("workflow_dispatch:");
    }
  });

  withWorkflows("gets write access only if it writes records", async () => {
    const agent = await loadAgent(id);
    const yml = await workflow(id);
    if (agent.writesRecords) {
      expect(yml).toMatch(/contents: write/);
      expect(yml).toContain("uses: ./.github/actions/commit-records");
    } else {
      expect(yml).toMatch(/contents: read/);
      expect(yml).not.toContain("commit-records");
    }
  });

  it("completes a dry run with no secrets", async () => {
    const agent = await loadAgent(id);
    const lines: string[] = [];
    await expect(
      runAgent(agent, {
        input: agent.dryRunInput ?? agent.exampleInput,
        dryRun: true,
        repoRoot: REPO_ROOT,
        env: {},
        log: (m) => lines.push(m),
        now: new Date("2026-10-05T06:00:00Z"),
      }),
    ).resolves.toBeDefined();
    expect(lines.length).toBeGreaterThan(0);
  });
});
