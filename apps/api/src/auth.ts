// Sign-in for every active Member: a Google ID token (or an emailed code, src/sign-in-codes.ts)
// in, an `nw_session` cookie out. The cookie holds an HS256 JWT whose `sub` is the member id;
// every /admin request re-checks the member row, so marking someone inactive or taking away
// `can_admin` takes effect immediately.
//
// Two guards: requireSession (any active member: their own projects, posts and files) and
// requireAdmin on top of it (members with `can_admin`: the inbox, outbox, money, partners…).

import { eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

import { members, type Database, type Member } from "@nw/db";

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

/** An active member, matched case-insensitively on email. */
export async function findMemberByEmail(db: Database, email: string): Promise<Member | undefined> {
  const [row] = await db
    .select()
    .from(members)
    .where(sql`lower(${members.email}) = ${email.trim().toLowerCase()} and ${members.active}`)
    .limit(1);
  return row;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "nw_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ISSUER = "nw-api";
const SESSION_AUDIENCE = "nw-admin";

const keyFrom = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(memberId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(memberId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(keyFrom(secret));
}

/** The member id in a valid session token, or null. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["HS256"],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** httpOnly, SameSite=Lax, Secure everywhere except plain-http localhost. */
export function sessionCookieOptions(c: Context, maxAge = SESSION_TTL_SECONDS): CookieOptions {
  const { hostname } = new URL(c.req.url);
  const local = LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  return { httpOnly: true, secure: !local, sameSite: "Lax", path: "/", maxAge };
}

/** Guards /admin/*: 401 without a valid session, 403 for a member who is no longer active. */
export function requireSession(db: Database, secret: string) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const memberId = token ? await verifySession(token, secret) : null;
    if (!memberId) return c.json({ error: "Not signed in" }, 401);

    const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!member) return c.json({ error: "Not signed in" }, 401);
    if (!member.active) return c.json({ error: "This member is not active" }, 403);

    c.set("member", toAdminMember(member));
    await next();
  });
}

/** After requireSession: only members with `can_admin`. */
export const requireAdmin = createMiddleware<ApiEnv>(async (c, next) => {
  if (!c.get("member").canAdmin) return c.json({ error: "Admins only" }, 403);
  await next();
});
