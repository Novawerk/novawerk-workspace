// What GitHub sends us: the signature check and the pull request events the task board reads.
// Only the fields we use are parsed; everything else in a payload is ignored.

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * True when `signature` (the X-Hub-Signature-256 header, `sha256=<hex>`) is the HMAC of the raw
 * body with our webhook secret. Constant time; any other shape is false.
 */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const hex = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const given = Buffer.from(hex, "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A pull request as the task board sees it. */
export interface PullRequestFacts {
  /** "Novawerk/novawerk-workspace" */
  repo: string;
  number: number;
  url: string;
  title: string;
  /** GitHub's numeric user id of the author: matched with the assignee's linked account. */
  authorId: number;
  authorLogin: string;
  state: "open" | "closed";
  merged: boolean;
  /** The task it names (`Task: NW-42`, or NW-42 in the title, body or branch), or null. */
  taskNumber: number | null;
}

const user = z.object({ id: z.number().int(), login: z.string() });

/** A pull request object, from a webhook or the REST API. */
export const pullRequestSchema = z.object({
  number: z.number().int(),
  html_url: z.url(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  updated_at: z.string().optional(),
  user,
  head: z.object({ ref: z.string() }),
  base: z.object({ repo: z.object({ full_name: z.string() }) }),
});
type PullRequestPayload = z.infer<typeof pullRequestSchema>;

/** The `pull_request` event: https://docs.github.com/webhooks/webhook-events-and-payloads#pull_request */
export const pullRequestEvent = z.object({
  action: z.string(),
  pull_request: pullRequestSchema,
  repository: z.object({ full_name: z.string() }),
});

/** Actions that can change what a PR points at, or its state. Others (labeled, assigned…) are ignored. */
export const PULL_REQUEST_ACTIONS = ["opened", "edited", "reopened", "synchronize", "ready_for_review", "closed"] as const;
export type PullRequestAction = (typeof PULL_REQUEST_ACTIONS)[number];

const TASK_LINE = /^\s*task:\s*nw-(\d{1,9})\b/im;
const TASK_ID = /\bnw-(\d{1,9})\b/i;
const BRANCH_ID = /(?:^|[/_.-])nw-?(\d{1,9})(?=$|[/_.-])/i;

/**
 * The task a PR names: a `Task: NW-42` line in the body first, then NW-42 anywhere in the title,
 * then in the body, then in the branch name (`nw-42-dark-mode`, `feat/nw42`). Null when none.
 */
export function taskNumberOf(pr: { title: string; body?: string | null; branch: string }): number | null {
  const body = pr.body ?? "";
  const match = TASK_LINE.exec(body) ?? TASK_ID.exec(pr.title) ?? TASK_ID.exec(body) ?? BRANCH_ID.exec(pr.branch);
  const n = match ? Number(match[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** The facts of a pull request object. */
export function pullRequestFacts(pr: PullRequestPayload): PullRequestFacts {
  return {
    repo: pr.base.repo.full_name,
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    authorId: pr.user.id,
    authorLogin: pr.user.login,
    state: pr.state,
    merged: pr.merged === true || Boolean(pr.merged_at),
    taskNumber: taskNumberOf({ title: pr.title, body: pr.body ?? null, branch: pr.head.ref }),
  };
}

/** A parsed delivery: what the board should look at, or why it is ignored. */
export type ParsedWebhook =
  | { kind: "pull_request"; action: PullRequestAction; pr: PullRequestFacts }
  | { kind: "ping" }
  | { kind: "ignored"; reason: string };

/** Parse a delivery by its X-GitHub-Event header. Throws (a ZodError) on a pull_request payload we can't read. */
export function parseWebhook(event: string | undefined, payload: unknown): ParsedWebhook {
  if (event === "ping") return { kind: "ping" };
  if (event !== "pull_request") return { kind: "ignored", reason: `event ${event ?? "(none)"}` };
  const parsed = pullRequestEvent.parse(payload);
  const action = PULL_REQUEST_ACTIONS.find((a) => a === parsed.action);
  if (!action) return { kind: "ignored", reason: `pull_request.${parsed.action}` };
  return { kind: "pull_request", action, pr: pullRequestFacts(parsed.pull_request) };
}
