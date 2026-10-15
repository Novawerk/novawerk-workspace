// Personal access tokens at the door: `Authorization: Bearer nwt_…` on /contrib, /public (task
// board reads) and /mcp. A valid token acts as its contributor with its scopes (checked per
// route, @nw/tasks requireScope); a bad `nwt_` token is a 401, never a silent fall back to
// anonymous. Any other Authorization header isn't ours and is ignored. Each token has its own
// hourly budget for reads and writes, and anonymous board reads have a looser one per network
// (in-memory, per instance, like the other limiters: a brake, not a wall). The website's own
// server, with `x-nw-web-key: $WEB_READ_KEY`, is exempt: it reads from Vercel's shared IPs.
//
// Browser sessions (the cookie) also get a check here: a write must come from one of the
// website's origins, or carry a JSON body (which a cross-site form can't send), on top of
// SameSite=Lax.

import { createHash, timingSafeEqual } from "node:crypto";

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { TOKEN_LIMITS, type TokenScope } from "@nw/contracts";
import type { Contributor, Database } from "@nw/db";
import { TaskRuleError, authenticateToken, requireScope, type TokenContext } from "@nw/tasks";

import { FixedWindowLimiter, clientIp } from "./intake-chat/rate-limit.js";
import type { ApiEnv } from "./types.js";

export type TokenAuth =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "ok"; contributor: Contributor; token: TokenContext };

const HOUR = 60 * 60_000;
const INVALID = "That token isn't valid: it may be revoked or expired. Make a new one at novawerk.io/settings/tokens.";

/** Anonymous task board reads per client IP per hour: looser than nothing, below a token's budget. */
export const ANONYMOUS_READS_PER_HOUR = 600;

export class TokenGate {
  private readonly reads = new FixedWindowLimiter(TOKEN_LIMITS.readsPerHour, HOUR);
  private readonly writes = new FixedWindowLimiter(TOKEN_LIMITS.writesPerHour, HOUR);
  private readonly anonymous = new FixedWindowLimiter(ANONYMOUS_READS_PER_HOUR, HOUR);

  /** `webReadKey`: the website's server, exempt from the anonymous limit (header `x-nw-web-key`). */
  constructor(
    private readonly db: Database,
    private readonly webReadKey?: string,
  ) {}

  /** The request is the website's own server reading the board. */
  private isWebsite(c: Context): boolean {
    const given = c.req.header("x-nw-web-key");
    if (!this.webReadKey || !given) return false;
    const digest = (v: string) => createHash("sha256").update(v).digest();
    return timingSafeEqual(digest(given), digest(this.webReadKey));
  }

  /** The bearer token on this request: only `Bearer nwt_…` counts as one of ours. */
  async authenticate(c: Context): Promise<TokenAuth> {
    const match = /^Bearer\s+(nwt_\S*)\s*$/i.exec(c.req.header("authorization") ?? "");
    if (!match) return { kind: "none" };
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
   * Public board reads: no token is fine (counted per network); a bad token is a 401; a good one
   * is counted against its own, larger budget.
   */
  optional() {
    return createMiddleware<ApiEnv>(async (c, next) => {
      const auth = await this.authenticate(c);
      if (auth.kind === "invalid") return c.json({ error: INVALID }, 401);
      if (auth.kind === "ok") this.take(auth.token.id, "read");
      else if (!this.isWebsite(c) && !this.anonymous.take(clientIp(c))) {
        return c.json({ error: "Too many requests from your network. Try again later, or use a token." }, 429);
      }
      await next();
    });
  }
}

export const invalidTokenMessage = INVALID;

const isRead = (method: string) => method === "GET" || method === "HEAD";

/**
 * A browser write is ours: its Origin is one of the website's, or (no Origin) it sends JSON,
 * which a cross-site form can't.
 */
function sameSiteWrite(c: Context, origins: readonly string[]): boolean {
  const origin = c.req.header("origin");
  if (origin) return origins.includes(origin);
  return (c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/**
 * /contrib/*: a browser session (the cookie) or a bearer token. With a token, `token` is set,
 * the request counts against its budget, and routes check their scope.
 */
export function contributorOrToken(
  gate: TokenGate,
  session: (c: Context) => Promise<Contributor | undefined>,
  origins: readonly string[],
) {
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
    if (!isRead(c.req.method) && !sameSiteWrite(c, origins)) {
      return c.json({ error: "Send this from novawerk.io, as JSON" }, 403);
    }
    c.set("contributor", contributor);
    await next();
  });
}

/** Marks a route's middleware as its access rule, so a test can check every route has one. */
export const ACCESS_RULE = Symbol("nw.accessRule");
type Marked<T> = T & { [ACCESS_RULE]: string };
const mark = <T extends object>(fn: T, rule: string): Marked<T> => Object.assign(fn, { [ACCESS_RULE]: rule });

/** The route needs this scope when called with a token. */
export const scope = (s: TokenScope) =>
  mark(
    createMiddleware<ApiEnv>(async (c, next) => {
      requireScope(c.get("token"), s);
      await next();
    }),
    `scope:${s}`,
  );

/** Browser only: tokens never manage tokens, confirm drafts or delete the account. */
export const sessionOnly = mark(
  createMiddleware<ApiEnv>(async (c, next) => {
    if (c.get("token")) throw new TaskRuleError("forbidden", "A token can't do this. Use novawerk.io in your browser.");
    await next();
  }),
  "browser",
);

/** `{ tokenId }` when the request came with a token: what gets recorded as "via agent". */
export const viaOf = (c: Context<ApiEnv>) => {
  const token = c.get("token");
  return token ? { tokenId: token.id } : undefined;
};
