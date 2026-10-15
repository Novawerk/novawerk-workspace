// Personal access tokens: how a contributor's agent (Claude Code, a script, the MCP server)
// acts for them. Only a SHA-256 of the secret is kept; the secret shows once. A token carries
// scopes (`tasks:read` always), lives 30 or 90 days, can be revoked, and never manages tokens,
// sign-in or the account: those stay in the browser. Everything it does is recorded as
// "via agent · <token name>".

import { createHash, randomBytes } from "node:crypto";

import { and, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import {
  TOKEN_LIMITS,
  TOKEN_SCOPES,
  type ContributorTokenInfo,
  type CreatedToken,
  type TokenScope,
  tokenCreateInput,
} from "@nw/contracts";
import { contributorTokens, contributors, type Contributor, type ContributorToken, type Database } from "@nw/db";

import { TaskRuleError } from "./errors.js";
import { iso } from "./people.js";

const TOKEN_PREFIX = "nwt_";
const SECRET = /^nwt_[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 3_600_000;
/** lastUsedAt is written at most once a minute per token. */
const TOUCH_MS = 60_000;

export const hashTokenSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** What a request made with a token carries: who, which token, which scopes. */
export interface TokenContext {
  id: string;
  name: string;
  scopes: TokenScope[];
}

function info(t: ContributorToken, now: Date): ContributorTokenInfo {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scopes: t.scopes as TokenScope[],
    expiresAt: iso(t.expiresAt),
    lastUsedAt: t.lastUsedAt ? iso(t.lastUsedAt) : null,
    createdAt: iso(t.createdAt),
    expired: t.expiresAt <= now,
  };
}

/** A new token. At most 10 live ones per person. */
export async function createToken(
  db: Database,
  contributorId: string,
  input: ReturnType<typeof tokenCreateInput.parse>,
  now = new Date(),
): Promise<CreatedToken> {
  const [live] = await db
    .select({ n: count() })
    .from(contributorTokens)
    .where(and(eq(contributorTokens.contributorId, contributorId), isNull(contributorTokens.revokedAt), gt(contributorTokens.expiresAt, now)));
  if ((live?.n ?? 0) >= TOKEN_LIMITS.activePerContributor) {
    throw new TaskRuleError("rate_limited", `Up to ${TOKEN_LIMITS.activePerContributor} tokens. Revoke one first.`);
  }
  const secret = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const scopes = TOKEN_SCOPES.filter((s) => s === "tasks:read" || input.scopes.includes(s));
  const [row] = await db
    .insert(contributorTokens)
    .values({
      contributorId,
      name: input.name,
      secretHash: hashTokenSecret(secret),
      prefix: secret.slice(0, TOKEN_PREFIX.length + 8),
      scopes,
      expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
      createdAt: now,
    })
    .returning();
  return { ...info(row!, now), secret };
}

/** The person's tokens, newest first: live, expired and (not) revoked ones. Revoked ones are left out. */
export async function listTokens(db: Database, contributorId: string, now = new Date()): Promise<ContributorTokenInfo[]> {
  const rows = await db
    .select()
    .from(contributorTokens)
    .where(and(eq(contributorTokens.contributorId, contributorId), isNull(contributorTokens.revokedAt)))
    .orderBy(desc(contributorTokens.createdAt));
  return rows.map((t) => info(t, now));
}

/** Revoke one of your own tokens. Revoking twice is fine; someone else's is "not found". */
export async function revokeToken(db: Database, contributorId: string, tokenId: string, now = new Date()): Promise<void> {
  const [row] = await db
    .select({ id: contributorTokens.id, revokedAt: contributorTokens.revokedAt })
    .from(contributorTokens)
    .where(and(eq(contributorTokens.id, tokenId), eq(contributorTokens.contributorId, contributorId)));
  if (!row) throw new TaskRuleError("not_found", "No such token");
  if (!row.revokedAt) await db.update(contributorTokens).set({ revokedAt: now }).where(eq(contributorTokens.id, tokenId));
}

/**
 * The contributor and token for a bearer secret: live (not revoked, not expired) and its owner
 * still there. Null otherwise. Notes when it was last used.
 */
export async function authenticateToken(
  db: Database,
  secret: string,
  now = new Date(),
): Promise<{ contributor: Contributor; token: TokenContext } | null> {
  if (!SECRET.test(secret)) return null;
  const [row] = await db
    .select({ token: contributorTokens, contributor: contributors })
    .from(contributorTokens)
    .innerJoin(contributors, eq(contributors.id, contributorTokens.contributorId))
    .where(
      and(
        eq(contributorTokens.secretHash, hashTokenSecret(secret)),
        isNull(contributorTokens.revokedAt),
        gt(contributorTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(contributorTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(contributorTokens.id, row.token.id),
        or(isNull(contributorTokens.lastUsedAt), lt(contributorTokens.lastUsedAt, new Date(now.getTime() - TOUCH_MS))),
      ),
    );
  return {
    contributor: row.contributor,
    token: { id: row.token.id, name: row.token.name, scopes: row.token.scopes as TokenScope[] },
  };
}

/** Throws unless the token has `scope`. A browser session (no token) may do anything it is allowed. */
export function requireScope(token: TokenContext | undefined, scope: TokenScope): void {
  if (token && !token.scopes.includes(scope)) {
    throw new TaskRuleError("forbidden", `This token doesn't have the ${scope} scope`);
  }
}
