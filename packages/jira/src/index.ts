// @nw/jira — typed wrapper over the `jira` CLI (ankitpokhrel/jira-cli), plus the NB board
// hygiene rules the agents use.
// Site novawerk-teams.atlassian.net, project NB, board 34. See .claude/skills/jira/SKILL.md.
// The CLI reads JIRA_API_TOKEN from its environment and its server/login from `jira init`.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export const PROJECT = "NB";
export const BOARD_ID = 34;

export interface JiraIssue {
  key: string;
  status: string;
  /** Display name, or "" when nobody owns it. */
  assignee: string;
  summary: string;
}

/** The two calls the agents make. Real (jiraCli) or fake (in dry runs and tests). */
export interface JiraClient {
  listIssues(jql?: string, opts?: { orderBy?: string; reverse?: boolean }): Promise<JiraIssue[]>;
  addComment(key: string, body: string): Promise<void>;
}

// ─── JQL the agents share ────────────────────────────────────────────────────
// Use statusCategory, not status names: NB's status names are mixed English/中文
// (e.g. the done status is 已完成, reached by the 完成 transition).
// The CLI adds `project = NB` and its own ORDER BY, so these never include either.

/** Everything not done. */
export const OPEN_JQL = "statusCategory != Done";
/** Done in the last `days` days. */
export const recentlyDoneJql = (days: number): string => `statusCategory = Done AND updated >= -${days}d`;
/** Blocked work. */
export const BLOCKED_JQL = 'status = "Blocked"';
/**
 * Open issues with no owner that have been quiet for `quietDays`. Our nudge comment updates
 * the issue, so the same issue is nudged at most once per quiet period.
 */
export const ownerlessJql = (quietDays: number): string =>
  `assignee is EMPTY AND statusCategory != Done AND updated <= -${quietDays}d`;

/** The house rule, as a comment. Plain and friendly. */
export const OWNER_NUDGE =
  "Friendly nudge: this issue has no owner yet. Our house rule is one artifact, one owner, " +
  "one done-by date. Could someone pick it up and set a date? Thanks.";

/** Keep only issues nobody owns. A guard on top of the JQL filter. */
export function findOwnerless(issues: JiraIssue[]): JiraIssue[] {
  return issues.filter((i) => {
    const a = i.assignee.trim();
    return a === "" || a === "-";
  });
}

/**
 * The jira-automation agent's work: find open, ownerless, quiet issues and leave the owner
 * nudge on each (oldest first, at most `max`). Comments only — never assigns, moves or closes.
 */
export async function nudgeOwnerless(
  jira: JiraClient,
  opts: { quietDays: number; max: number; log: (message: string) => void },
): Promise<{ nudged: string[]; found: number }> {
  const candidates = findOwnerless(await jira.listIssues(ownerlessJql(opts.quietDays), { orderBy: "created", reverse: true }));
  const batch = candidates.slice(0, opts.max);
  opts.log(`${candidates.length} ownerless issue(s) quiet for ${opts.quietDays}+ days; nudging ${batch.length}.`);
  const nudged: string[] = [];
  for (const issue of batch) {
    await jira.addComment(issue.key, OWNER_NUDGE);
    nudged.push(issue.key);
    opts.log(`nudged ${issue.key}: ${issue.summary}`);
  }
  return { nudged, found: candidates.length };
}

// ─── The CLI client ──────────────────────────────────────────────────────────

/** Parse `jira issue list --raw` (a JSON array of issues) into our shape. */
export function parseRawIssues(stdout: string): JiraIssue[] {
  const data = JSON.parse(stdout) as unknown;
  if (!Array.isArray(data)) throw new Error("jira issue list --raw did not return an array");
  return data.map((raw) => {
    const issue = raw as {
      key?: string;
      fields?: { summary?: string; status?: { name?: string }; assignee?: { displayName?: string } | null };
    };
    return {
      key: issue.key ?? "",
      status: issue.fields?.status?.name ?? "",
      assignee: issue.fields?.assignee?.displayName ?? "",
      summary: issue.fields?.summary ?? "",
    };
  });
}

async function jira(args: string[]): Promise<string> {
  const { stdout } = await exec("jira", args, { env: process.env, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** List NB issues, optionally filtered by JQL (no ORDER BY — pass `orderBy`). */
export async function listIssues(jql?: string, opts: { orderBy?: string; reverse?: boolean } = {}): Promise<JiraIssue[]> {
  const args = ["issue", "list", "-p", PROJECT, "--raw"];
  if (jql) args.push("-q", jql);
  if (opts.orderBy) args.push("--order-by", opts.orderBy);
  if (opts.reverse) args.push("--reverse");
  try {
    return parseRawIssues(await jira(args));
  } catch (err) {
    // The CLI exits 1 with "No result found" when the query matches nothing.
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (/No result found/i.test(`${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`)) return [];
    throw err;
  }
}

/** Create an issue. Returns the new key. */
export async function createIssue(opts: {
  type: "Task" | "Bug" | "Story";
  summary: string;
  body?: string;
  assignee?: string;
  epic?: string;
}): Promise<string> {
  const args = ["issue", "create", "-p", PROJECT, "-t", opts.type, "-s", opts.summary, "--no-input"];
  if (opts.body) args.push("-b", opts.body);
  if (opts.assignee) args.push("-a", opts.assignee);
  if (opts.epic) args.push("-P", opts.epic);
  const out = await jira(args);
  const key = /NB-\d+/.exec(out)?.[0];
  if (!key) throw new Error(`jira create did not return an NB key: ${out}`);
  return key;
}

/** Transition an issue. Transition names are mixed EN/中文 — pass the exact string. */
export async function moveIssue(key: string, transition: string): Promise<void> {
  await jira(["issue", "move", key, "-p", PROJECT, transition]);
}

export async function addComment(key: string, body: string): Promise<void> {
  await jira(["issue", "comment", "add", key, "-p", PROJECT, body, "--no-input"]);
}

/** The real client: the `jira` CLI on PATH. */
export const jiraCli: JiraClient = { listIssues, addComment };

/** A fake for dry runs and tests: serves fixed issues, records comments instead of posting. */
export function fakeJira(issues: JiraIssue[], onComment?: (key: string, body: string) => void): JiraClient & {
  comments: Array<{ key: string; body: string }>;
} {
  const comments: Array<{ key: string; body: string }> = [];
  return {
    comments,
    async listIssues(jql) {
      if (!jql) return issues;
      // Just enough JQL for the fixtures: the filters the agents actually use.
      return issues.filter((i) => {
        if (jql.includes("assignee is EMPTY") && findOwnerless([i]).length === 0) return false;
        if (jql.includes("statusCategory != Done") && i.status === "Done") return false;
        if (jql.includes("statusCategory = Done") && i.status !== "Done") return false;
        if (jql.includes('status = "Blocked"') && i.status !== "Blocked") return false;
        return true;
      });
    },
    async addComment(key, body) {
      comments.push({ key, body });
      onComment?.(key, body);
    },
  };
}
