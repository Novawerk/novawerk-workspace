// One session for the whole of novawerk.io (NB-ADR-0014): the site, the admin panel and the API.
// Sign-in (src/routes/auth.ts: GitHub, Google or an emailed code) sets one `nw_session` cookie on
// the API's domain, an HS256 JWT whose `sub` is the account id and `ims` its issue time. Every
// request re-reads the account: a deleted or inactive account is out at once, and a session
// issued before `sessions_revoked_at` (sign-out, a new way in) is refused. The cookie of the
// two-cookie days (`nw_contributor`, and `nw_session` with its old audience) no longer opens
// anything: everyone signed in again once.
//
// One cookie means one less wall around the admin panel, so the routes decide (NB-ADR-0008):
// requireSession lets in maintainers and members on a project's team (their own projects, posts
// and files), and requireAdmin on top of it only maintainers (the inbox, outbox, money,
// partners…). Personal access tokens never reach /admin (src/token-gate.ts serves /contrib and
// /mcp only), so a token never carries maintainer rights.

import { eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

import { isMaintainer, members, projectMembers, type Database, type Member } from "@nw/db";

import { toAdminMember, type ApiEnv, type GoogleVerifier } from "./types.js";

// ─── Google ──────────────────────────────────────────────────────────────────

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
/** Google issues ID tokens under either spelling. */
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Verify a Google Identity Services credential: signature against Google's JWKS, audience
 * = our client id, Google issuer, unexpired, and a verified email. `keys` is injectable so
 * the checks can be tested offline.
 */
export function createGoogleVerifier(
  clientId: string,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
): GoogleVerifier {
  return async (credential) => {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      algorithms: ["RS256"],
    });
    if (payload.email_verified !== true || typeof payload.email !== "string" || !payload.sub) {
      throw new Error("Google account has no verified email");
    }
    return {
      email: payload.email.toLowerCase(),
      sub: payload.sub,
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    };
  };
}

/** An active account, matched case-insensitively on email (local development's /auth/dev). */
export async function findMemberByEmail(db: Database, email: string): Promise<Member | undefined> {
  const [row] = await db
    .select()
    .from(members)
    .where(sql`lower(${members.email}) = ${email.trim().toLowerCase()} and ${members.active}`)
    .limit(1);
  return row;
}

/** Maintainers, and members on a project's team ("My projects"). Nobody else (NB-ADR-0014). */
export async function mayOpenAdminPanel(db: Database, member: Member): Promise<boolean> {
  if (isMaintainer(member)) return true;
  const [team] = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.memberId, member.id))
    .limit(1);
  return Boolean(team);
}

// ─── Session ─────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "nw_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_ISSUER = "nw-api";
/** Not `nw-admin` or `nw-contributor`: the sessions of the two-cookie days don't open anything. */
const SESSION_AUDIENCE = "nw-session";

const keyFrom = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(memberId: string, secret: string, now = Date.now()): Promise<string> {
  // `ims`: issued at, in milliseconds (`iat` is whole seconds), compared with sessions_revoked_at.
  return new SignJWT({ ims: now })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(memberId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(keyFrom(secret));
}

/** The account id and issue time in a valid session token, or null. */
export async function verifySession(token: string, secret: string): Promise<{ id: string; issuedMs: number } | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.ims !== "number") return null;
    return { id: payload.sub, issuedMs: payload.ims };
  } catch {
    return null;
  }
}

/**
 * The signed-in account: a valid cookie, an account that still exists and is active, and a
 * session issued after any revocation. Undefined otherwise.
 */
export async function currentAccount(db: Database, cookie: string | undefined, secret: string): Promise<Member | undefined> {
  const session = cookie ? await verifySession(cookie, secret) : null;
  if (!session) return undefined;
  const [account] = await db.select().from(members).where(eq(members.id, session.id)).limit(1);
  if (!account?.active) return undefined;
  if (account.sessionsRevokedAt && session.issuedMs < account.sessionsRevokedAt.getTime()) return undefined;
  return account;
}

/** Sets the session cookie for this account. */
export async function startSession(c: Context, memberId: string, secret: string): Promise<void> {
  setCookie(c, SESSION_COOKIE, await signSession(memberId, secret), sessionCookieOptions(c));
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** httpOnly, SameSite=Lax, Secure everywhere except plain-http localhost. */
export function sessionCookieOptions(c: Context, maxAge = SESSION_TTL_SECONDS): CookieOptions {
  const { hostname } = new URL(c.req.url);
  const local = LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  return { httpOnly: true, secure: !local, sameSite: "Lax", path: "/", maxAge };
}

/**
 * Guards /admin/*: 401 without a valid session, 403 for an account that may not open the admin
 * panel (neither a maintainer nor on a project's team).
 */
export function requireSession(db: Database, secret: string) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const member = await currentAccount(db, getCookie(c, SESSION_COOKIE), secret);
    if (!member) return c.json({ error: "Not signed in" }, 401);
    if (!(await mayOpenAdminPanel(db, member))) return c.json({ error: "Not on a project's team" }, 403);
    c.set("member", toAdminMember(member));
    await next();
  });
}

/** After requireSession: maintainers only. */
export const requireAdmin = createMiddleware<ApiEnv>(async (c, next) => {
  if (!isMaintainer(c.get("member"))) return c.json({ error: "Admins only" }, 403);
  await next();
});
