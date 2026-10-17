// The task board for agents: an MCP server at /mcp (Streamable HTTP, stateless, JSON responses)
// on the same @nw/tasks functions as /public and /contrib. Reading needs nothing; acting needs a
// personal access token (`Authorization: Bearer nwt_…`) with the tool's scope. A proposal made
// here is a draft until its person confirms it in the browser. Everything an agent writes shows
// "via agent · <token name>".
//
// Add it to Claude Code:  claude mcp add --transport http novawerk https://api.novawerk.io/mcp \
//                           --header "Authorization: Bearer nwt_…"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { parsePullRequestUrl } from "@nw/github";
import {
  CONTRIBUTOR_SORTS,
  PROFILE_ACCENTS,
  PROFILE_BANNERS,
  PROPOSAL_ETAS,
  SUGGESTION_KINDS,
  SUGGESTION_WHERE,
  TASK_AREAS,
  TASK_SIZES,
  TASK_SORTS,
  TASK_STATUS_FILTERS,
  contributorListQuery,
  formatTaskId,
  parseTaskId,
  memberTaskInput,
  postInput,
  prLinkInput,
  profileUpdateInput,
  proposalInput,
  suggestionInput,
  taskListQuery,
  type TokenScope,
} from "@nw/contracts";
import type { Member } from "@nw/db";
import {
  TaskRuleError,
  addPost,
  checkCanLinkPr,
  createOwnTask,
  getPublicTask,
  guideFor,
  linkPrByHand,
  listPublicContributors,
  listPublicTasks,
  myTasks,
  propose,
  releaseHeldTask,
  requireScope,
  suggestTask,
  toContributorMe,
  toPublicProposal,
  unvote,
  updateProfile,
  vote,
  type TokenContext,
} from "@nw/tasks";

import { tellChatProfile } from "./chat-sso.js";
import { FixedWindowLimiter, clientIp } from "./intake-chat/rate-limit.js";
import { revalidateWeb } from "./revalidate.js";
import { invalidTokenMessage, type TokenGate } from "./token-gate.js";
import type { ApiEnv, AppDeps, Logger } from "./types.js";

const MAX_BODY_BYTES = 64 * 1024;
/** MCP requests per client IP per hour without a token (in-memory, per instance). */
export const ANONYMOUS_MCP_PER_HOUR = 300;

type Caller = { contributor: Member; token: TokenContext } | null;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const taskId = z.string().describe('A task id, e.g. "NW-42"');
const taskNumber = (id: string) => {
  const n = parseTaskId(id);
  if (n === null) throw new TaskRuleError("invalid", `"${id}" isn't a task id. Use NW-42.`);
  return n;
};

/** One server per request (stateless): its tools see this request's caller. */
export function buildMcpServer(
  deps: Pick<AppDeps, "db" | "env" | "githubApi"> & { logger: Logger },
  caller: Caller,
  gate: TokenGate,
): McpServer {
  const { db, env, githubApi } = deps;
  const server = new McpServer({ name: "novawerk-task-board", version: "1.0.0" });

  /** Runs a tool; rule errors and bad input come back as tool errors the agent can read. */
  const run = async (fn: () => Promise<unknown>): Promise<ToolResult> => {
    try {
      return ok(await fn());
    } catch (err) {
      if (err instanceof TaskRuleError) return fail(err.message);
      if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("\n"));
      deps.logger.error("[mcp] tool failed:", err);
      return fail("Something went wrong on our side.");
    }
  };

  /** The caller, for a tool that acts: a token with `scope`, counted as a write when it writes. */
  const as = (scope: TokenScope, kind: "read" | "write" = "write") => {
    if (!caller) {
      throw new TaskRuleError(
        "forbidden",
        `This tool needs a personal access token with the ${scope} scope. Make one at ${env.publicUrls.webUrl}/settings/tokens and send it as "Authorization: Bearer nwt_…".`,
      );
    }
    requireScope(caller.token, scope);
    if (kind === "write") gate.take(caller.token.id, "write");
    return { me: caller.contributor, via: { tokenId: caller.token.id } };
  };

  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  // ─── Reading (no token needed) ───────────────────────────────────────────
  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Tasks on the Novawerk task board, last changed first (or most +1s with sort=votes). Filters combine. Default status: active (suggested, open, in progress, in review).",
      inputSchema: {
        area: z.array(z.enum(TASK_AREAS)).optional(),
        size: z.array(z.enum(TASK_SIZES)).optional(),
        status: z.enum(TASK_STATUS_FILTERS).optional(),
        skills: z.array(z.string().max(40)).max(10).optional(),
        q: z.string().max(100).optional().describe("Matches the title, the summary, or the id"),
        sort: z.enum(TASK_SORTS).optional(),
        cursor: z.string().optional().describe("nextCursor from the previous page"),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        listPublicTasks(
          db,
          taskListQuery.parse({
            ...args,
            area: args.area?.join(","),
            size: args.size?.join(","),
            skills: args.skills?.join(","),
            limit: args.limit !== undefined ? String(args.limit) : undefined,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "One task: what and why, done-when, proposals, the discussion and the timeline.",
      inputSchema: { id: taskId },
      annotations: readOnly,
    },
    ({ id }) =>
      run(async () => {
        const task = await getPublicTask(db, taskNumber(id));
        if (!task) throw new TaskRuleError("not_found", `${id} doesn't exist`);
        return task;
      }),
  );

  server.registerTool(
    "list_contributors",
    {
      title: "List contributors",
      description: "People with merged work or an accepted idea who show on the contributors wall. Newest contribution first, or A–Z. Never ranked.",
      inputSchema: {
        area: z.enum(TASK_AREAS).optional(),
        sort: z.enum(CONTRIBUTOR_SORTS).optional(),
        cursor: z.string().optional(),
      },
      annotations: readOnly,
    },
    (args) => run(() => listPublicContributors(db, contributorListQuery.parse(args))),
  );

  // ─── Me (a token) ────────────────────────────────────────────────────────
  server.registerTool(
    "whoami",
    { title: "Who am I", description: "The contributor this token acts for, and its scopes.", annotations: readOnly },
    () =>
      run(async () => {
        const { me } = as("tasks:read", "read");
        return { ...toContributorMe(me), email: null, notifyEmail: null, token: { name: caller!.token.name, scopes: caller!.token.scopes } };
      }),
  );

  server.registerTool(
    "my_tasks",
    { title: "My tasks", description: "Tasks I hold (in progress or in review) and my proposals still waiting, drafts included.", annotations: readOnly },
    () => run(async () => myTasks(db, as("tasks:read", "read").me.id)),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Contribution guide",
      description: "How to work on a task I hold: get the code, our rules, done-when, how to open the PR. Markdown.",
      inputSchema: { task_id: taskId },
      annotations: readOnly,
    },
    ({ task_id }) => run(async () => guideFor(db, as("tasks:read", "read").me, taskNumber(task_id))),
  );

  // ─── Acting (a token with the scope) ─────────────────────────────────────
  server.registerTool(
    "propose",
    {
      title: "Propose a plan (draft)",
      description:
        "Draft a plan for an open task. It stays a draft, visible only to you, until you confirm it on novawerk.io: the confirm_url in the answer. Read the task's done-when first.",
      inputSchema: {
        task_id: taskId,
        approach: z.string().describe("What you'll change: which files or screens, and the idea"),
        testing: z.string().optional().describe("How you'll test it"),
        eta: z.enum(PROPOSAL_ETAS).describe("days, week or two_weeks"),
      },
    },
    ({ task_id, approach, testing, eta }) =>
      run(async () => {
        const { me, via } = as("proposals:write");
        const n = taskNumber(task_id);
        const row = await propose(db, me, n, proposalInput.parse({ approach, testing, eta, readCriteria: true }), undefined, via);
        return {
          proposal: toPublicProposal(row, me, caller!.token.name),
          draft: true,
          confirm_url: `${env.publicUrls.webUrl}/tasks/${formatTaskId(n)}?confirm=${row.id}`,
        };
      }),
  );

  server.registerTool(
    "post_comment",
    {
      title: "Post on a task",
      description: "Post in a task's discussion, or reply to a post (one level). Public, shown as via agent.",
      inputSchema: { task_id: taskId, body: z.string(), reply_to: z.string().optional().describe("The post id to reply to") },
    },
    ({ task_id, body, reply_to }) =>
      run(async () => {
        const { me, via } = as("discussion:write");
        const post = await addPost(db, me, taskNumber(task_id), postInput.parse({ body, ...(reply_to ? { replyTo: reply_to } : {}) }), undefined, via);
        return { id: post.id };
      }),
  );

  server.registerTool(
    "suggest_task",
    {
      title: "Suggest a task",
      description:
        "Suggest an improvement or a bug in Novawerk's own tools. Public. Up to 3 waiting at a time. Never post a security issue: email security@novawerk.io.",
      inputSchema: {
        title: z.string(),
        kind: z.enum(SUGGESTION_KINDS),
        body: z.string().describe("What and why. For a bug: what happened, what you expected, the steps."),
        where: z.enum(SUGGESTION_WHERE),
        path: z.string().optional(),
        do_it_myself: z.boolean().optional(),
      },
    },
    ({ do_it_myself, ...rest }) =>
      run(async () => {
        const { me, via } = as("suggestions:write");
        const task = await suggestTask(db, me, suggestionInput.parse({ ...rest, doItMyself: do_it_myself ?? false }), new Date(), via);
        return { id: formatTaskId(task.id) };
      }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description:
        "Create a task on the board, before you open a pull request for work that has none (look with list_tasks first). S: yours at once, put `Task: NW-<n>` in the pull request. M: open on the board at once, to discuss in public; propose a plan and wait for a maintainer to choose one before you start. L and XL: wait for a maintainer's review first. Public. Up to 3 a day.",
      inputSchema: {
        title: z.string(),
        summary: z.string().optional().describe("One line under the title."),
        body: z.string().describe("What and why, Markdown."),
        criteria: z.array(z.string()).describe('"Done when" lines: what a reviewer checks.'),
        area: z.enum(TASK_AREAS),
        size: z.enum(TASK_SIZES).describe("S: an hour or two, one small change. M: discussed first. L, XL: reviewed first."),
        skills: z.array(z.string()).optional(),
      },
    },
    (input) =>
      run(async () => {
        const { me, via } = as("tasks:work");
        const task = await createOwnTask(db, me, memberTaskInput.parse(input), new Date(), via);
        await revalidateWeb(env.webRevalidate, deps.logger, ["tasks"]);
        return {
          id: formatTaskId(task.id),
          status: task.status,
          url: `${env.publicUrls.webUrl}/tasks/${formatTaskId(task.id)}`,
          next:
            task.status === "assigned"
              ? `It's yours. Open the pull request with "Task: ${formatTaskId(task.id)}" in its body.`
              : task.status === "open"
                ? "It's on the board for discussion. Propose a plan on it; a maintainer chooses one before work starts."
                : "It waits for a maintainer's review. Don't start yet: once it's accepted, it's yours or open for plans.",
        };
      }),
  );

  server.registerTool(
    "upvote_task",
    { title: "+1 a suggestion", description: "Add your +1 to a suggested task (not your own).", inputSchema: { task_id: taskId } },
    ({ task_id }) =>
      run(async () => {
        await vote(db, as("suggestions:write").me, taskNumber(task_id));
        return { ok: true };
      }),
  );

  server.registerTool(
    "remove_upvote",
    { title: "Take a +1 back", description: "Remove your +1 while the task is still suggested.", inputSchema: { task_id: taskId } },
    ({ task_id }) =>
      run(async () => {
        await unvote(db, as("suggestions:write").me, taskNumber(task_id));
        return { ok: true };
      }),
  );

  server.registerTool(
    "link_pr",
    {
      title: "Link a pull request",
      description:
        "Link your PR to the task you hold, when the board didn't pick it up from `Task: NW-42` in its body. It must be open, yours (the GitHub account linked to your profile) and name the task.",
      inputSchema: { task_id: taskId, url: z.string().describe("https://github.com/Novawerk/novawerk-workspace/pull/123") },
    },
    ({ task_id, url }) =>
      run(async () => {
        const { me, via } = as("tasks:work");
        // As on the website: the PR as GitHub sees it must be open, theirs, and name the task.
        const ref = parsePullRequestUrl(prLinkInput.parse({ url }).url);
        if (!ref) throw new TaskRuleError("invalid", "A pull request link");
        await checkCanLinkPr(db, me, taskNumber(task_id), ref.repo);
        if (!githubApi) throw new TaskRuleError("invalid", 'Linking by hand isn\'t available yet. Put "Task: NW-<n>" in the pull request\'s description instead.');
        const pr = await githubApi.getPullRequest(ref.repo, ref.number);
        if (!pr) throw new TaskRuleError("invalid", "We can't find that pull request");
        const task = await linkPrByHand(db, me, taskNumber(task_id), pr, via);
        return { status: task.status, pr_url: task.prUrl };
      }),
  );

  server.registerTool(
    "release_task",
    {
      title: "Release a task",
      description: "Give a task you hold back to the board. Nothing counts against you.",
      inputSchema: { task_id: taskId, reason: z.string().max(300).optional() },
      annotations: { destructiveHint: true },
    },
    ({ task_id, reason }) =>
      run(async () => {
        const { me, via } = as("tasks:work");
        await releaseHeldTask(db, me, taskNumber(task_id), reason, via);
        return { ok: true };
      }),
  );

  server.registerTool(
    "update_profile",
    {
      title: "Update my profile",
      description: "Name, bio, about, links, accent and banner. Handle and who can see the profile stay browser-only.",
      inputSchema: {
        display_name: z.string().optional(),
        bio: z.string().optional(),
        about: z.string().optional(),
        links: z.array(z.string()).optional(),
        accent: z.enum(PROFILE_ACCENTS).optional(),
        banner: z.enum(PROFILE_BANNERS).optional(),
      },
    },
    ({ display_name, ...rest }) =>
      run(async () => {
        const { me } = as("profile:write");
        const row = await updateProfile(db, me.id, profileUpdateInput.parse({ ...rest, ...(display_name !== undefined ? { displayName: display_name } : {}) }));
        await tellChatProfile(deps, row.id);
        return { ...toContributorMe(row), email: null, notifyEmail: null };
      }),
  );

  return server;
}

/**
 * POST /mcp. Stateless: every request gets its own server and transport. One JSON-RPC message per
 * request (no batches: each call counts against a budget). A browser may call it only from our
 * own origins. GET (a stream) and DELETE (a session) don't exist here: 405.
 */
export function mcpRoutes(deps: AppDeps & { logger: Logger }, gate: TokenGate) {
  const anonymous = new FixedWindowLimiter(ANONYMOUS_MCP_PER_HOUR, 60 * 60_000);
  return new Hono<ApiEnv>()
    .use("*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large" }, 413) }))
    .on(["GET", "DELETE"], "/", (c) => c.json({ error: "Method not allowed: this server is stateless, POST only" }, 405, { Allow: "POST" }))
    .post("/", async (c) => {
      const origin = c.req.header("origin");
      if (origin && !deps.env.allowedOrigins.includes(origin)) return c.json({ error: "Not allowed from this origin" }, 403);

      let message: unknown;
      try {
        message = await c.req.raw.clone().json();
      } catch {
        return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
      }
      if (Array.isArray(message)) {
        return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "One message per request: batches aren't supported" } }, 400);
      }

      const auth = await gate.authenticate(c);
      if (auth.kind === "invalid") return c.json({ error: invalidTokenMessage }, 401);
      if (auth.kind === "ok") gate.take(auth.token.id, "read");
      else if (!anonymous.take(clientIp(c))) return c.json({ error: "Too many requests from your network. Use a token, or try later." }, 429);

      const server = buildMcpServer(deps, auth.kind === "ok" ? { contributor: auth.contributor, token: auth.token } : null, gate);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try {
        return await transport.handleRequest(c.req.raw, { parsedBody: message });
      } finally {
        void server.close();
      }
    });
}
