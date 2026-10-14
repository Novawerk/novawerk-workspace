// The runner only loads the secrets an agent declared, never loads any in a dry run, and
// always closes services.

import { describe, expect, it, vi } from "vitest";

import { defineAgent, runAgent } from "./agent.js";

function testAgent(close = vi.fn(async () => {})) {
  return defineAgent({
    id: "test-agent",
    description: "Echoes its input.",
    triggers: [{ kind: "manual" }],
    needs: ["anthropic"],
    effects: ["none"],
    parseInput: (raw) => ({ name: typeof raw === "object" && raw && "name" in raw ? String(raw.name) : "world" }),
    services: (cfg) => ({ key: cfg.anthropic.apiKey, close }),
    dryRunServices: () => ({ key: "dry", close }),
    run: async (input, services) => `${input.name}:${services.key}`,
  });
}

describe("runAgent", () => {
  it("loads only the declared config sections", async () => {
    const out = await runAgent(testAgent(), {
      input: { name: "ada" },
      repoRoot: "/repo",
      env: { ANTHROPIC_API_KEY: "sk-1" }, // no DATABASE_URL, no JIRA_*: not needed
      log: () => {},
    });
    expect(out).toBe("ada:sk-1");
  });

  it("fails fast naming the missing secret", async () => {
    await expect(runAgent(testAgent(), { repoRoot: "/repo", env: {}, log: () => {} })).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("dry run needs no secrets and uses the fakes", async () => {
    const out = await runAgent(testAgent(), { dryRun: true, repoRoot: "/repo", env: {}, log: () => {} });
    expect(out).toBe("world:dry");
  });

  it("closes services even when the run throws", async () => {
    const close = vi.fn(async () => {});
    const agent = { ...testAgent(close), run: async () => Promise.reject(new Error("boom")) };
    await expect(runAgent(agent, { dryRun: true, repoRoot: "/repo", log: () => {} })).rejects.toThrow("boom");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-kebab id", () => {
    expect(() => defineAgent({ ...testAgent(), id: "Not Kebab" })).toThrow(/kebab/);
  });
});
