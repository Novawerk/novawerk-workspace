// A tiny fixed-window limiter for starting new chats.
//
// It lives in this process's memory. Serverless instances (Vercel Functions) share no memory,
// so the real limit is "N per window per warm instance": a brake on casual abuse, not a hard
// guarantee. If abuse shows up, move it to Postgres or an edge rate limit (Vercel Firewall).

import type { Context } from "hono";

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one hit for `key`; false when the key is over its limit for this window. */
  take(key: string): boolean {
    const t = this.now();
    if (this.hits.size > 10_000) this.prune(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }

  private prune(t: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}

/**
 * The client's IP. On Vercel `x-forwarded-for` is set by the platform (a client can't spoof
 * the first entry). Without a proxy header everyone shares the "unknown" bucket.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip")?.trim() || "unknown";
}
