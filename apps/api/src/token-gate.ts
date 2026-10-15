// Personal access tokens at the door: `Authorization: Bearer nwt_…` on /contrib, /public (task
// board reads) and /mcp. A valid token acts as its contributor with its scopes (checked per
// route, @nw/tasks requireScope); a bad one is a 401, never a silent fall back to anonymous.
// Each token has its own hourly budget for reads and writes (in-memory, per instance, like the
// other limiters: a brake, not a wall).

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { TOKEN_LIMITS } from "@nw/contracts";
import type { Contributor, Database } from "@nw/db";
import { TaskRuleError, authenticateToken, requireScope, type TokenContext } from "@nw/tasks";

import { FixedWindowLimiter } from "./intake-chat/rate-limit.js";
import type { ApiEnv } from "./types.js";

export type TokenAuth =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "ok"; contributor: Contributor; token: TokenContext };

const HOUR = 60 * 60_000;
const INVALID = "That token isn't valid: it may be revoked or expired. Make a new one at novawerk.io/settings/tokens.";

export class TokenGate {
  private readonly reads = new FixedWindowLimiter(TOKEN_LIMITS.readsPerHour, HOUR);
  private readonly writes = new FixedWindowLimiter(TOKEN_LIMITS.writesPerHour, HOUR);

  constructor(private readonly db: Database) {}

  /** The bearer token on this request, if any. */
  async authenticate(c: Context): Promise<TokenAuth> {
    const header = c.req.header("authorization");
    if (!header) return { kind: "none" };
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    if (!match) return { kind: "invalid" };
    const found = await authenticateToken(this.db, match[1]!);
    return found ? { kind: "ok", ...found } : { kind: "invalid" };
  }

  /** Counts one request against the token's budget; throws a 429 rule error when it's spent. */
  take(tokenId: string, kind: "read" | "write"): void {
    if (!(kind === "read" ? this.reads : this.writes).take(tokenId)) {
      const limit = kind === "read" ? TOKEN_LIMITS.readsPerHour : TOKEN_LIMITS.writesPerHour;
      throw new TaskRuleError("rate_limited", `This token used its ${limit} ${kind}s for this hour. Try again later.`);
    }
  }

  /**
   * Optional on public reads: no header is fine (anonymous); a bad token is a 401; a good one is
   * counted against its budget.
   */
  optional() {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const auth = await this.authenticate(c);
      if (auth.kind === "invalid") return c.json({ error: INVALID }, 401);
      if (auth.kind === "ok") this.take(auth.token.id, "read");
      await next();
    });
  }
}

export const invalidTokenMessage = INVALID;

const isRead = (method: string) => method === "GET" || method === "HEAD";

/**
 * /contrib/*: a browser session (the cookie) or a bearer token. With a token, `token` is set,
 * the request counts against its budget, and routes check their scope.
 */
export function contributorOrToken(gate: TokenGate, session: (c: Context) => Promise<Contributor | undefined>) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const auth = await gate.authenticate(c);
    if (auth.kind === "invalid") return c.json({ error: INVALID }, 401);
    if (auth.kind === "ok") {
      gate.take(auth.token.id, isRead(c.req.method) ? "read" : "write");
      c.set("contributor", auth.contributor);
      c.set("token", auth.token);
      return next();
    }
    const contributor = await session(c);
    if (!contributor) return c.json({ error: "Not signed in" }, 401);
    c.set("contributor", contributor);
    await next();
  });
}

/** The route needs this scope when called with a token. */
export const scope = (s: Parameters<typeof requireScope>[1]) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    requireScope(c.get("token"), s);
    await next();
  });

/** Browser only: tokens never manage tokens, confirm drafts or delete the account. */
export const sessionOnly = createMiddleware<ApiEnv>(async (c, next) => {
  if (c.get("token")) throw new TaskRuleError("forbidden", "A token can't do this. Use novawerk.io in your browser.");
  await next();
});

/** `{ tokenId }` when the request came with a token: what gets recorded as "via agent". */
export const viaOf = (c: Context<ApiEnv>) => {
  const token = c.get("token");
  return token ? { tokenId: token.id } : undefined;
};
