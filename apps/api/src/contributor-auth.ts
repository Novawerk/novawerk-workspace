// Contributor sessions, kept apart from member sessions (src/auth.ts). Contributors are not
// Members (NB-ADR-0013): their cookie is `nw_contributor`, an HS256 JWT with its own audience,
// so it never opens /admin, and a member's `nw_session` never opens /contrib. Every request
// re-reads the contributor row: a deleted account is signed out at once.
//
// GitHub sign-in is the OAuth web flow of our GitHub App (user authorization). We keep GitHub's
// numeric user id and login, never the access token. The `state` travels in a short-lived signed
// cookie with where to go back to, and who to link GitHub to when someone signed in by email.

import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";

import { getContributor, type GitHubUser } from "@nw/tasks";

import type { ApiEnv } from "./types.js";

export const CONTRIBUTOR_COOKIE = "nw_contributor";
export const CONTRIBUTOR_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ISSUER = "nw-api";
const AUDIENCE = "nw-contributor";

export const GITHUB_STATE_COOKIE = "nw_github_state";
export const GITHUB_STATE_TTL_SECONDS = 10 * 60;
const STATE_AUDIENCE = "nw-github-state";

/** The path GitHub sends people back to. The GitHub App lists it (prod and localhost). */
export const GITHUB_CALLBACK_PATH = "/auth/contributor/github/callback";

const keyFrom = (secret: string) => new TextEncoder().encode(secret);

export async function signContributorSession(contributorId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(contributorId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CONTRIBUTOR_SESSION_TTL_SECONDS}s`)
    .sign(keyFrom(secret));
}

/** The contributor id in a valid contributor session token, or null. */
export async function verifyContributorSession(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** What the state cookie carries through GitHub and back. */
export interface GitHubState {
  state: string;
  /** A path on the website. */
  returnTo: string;
  /** Link GitHub to this signed-in contributor instead of signing in. */
  linkTo?: string;
}

export async function signGitHubState(value: GitHubState, secret: string): Promise<string> {
  return new SignJWT({ ...value })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${GITHUB_STATE_TTL_SECONDS}s`)
    .sign(keyFrom(secret));
}

export async function verifyGitHubState(token: string, secret: string): Promise<GitHubState | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), { issuer: ISSUER, audience: STATE_AUDIENCE, algorithms: ["HS256"] });
    if (typeof payload.state !== "string" || typeof payload.returnTo !== "string") return null;
    return {
      state: payload.state,
      returnTo: payload.returnTo,
      ...(typeof payload.linkTo === "string" ? { linkTo: payload.linkTo } : {}),
    };
  } catch {
    return null;
  }
}

/** The signed-in contributor's id, or null. Doesn't check the row. */
export async function contributorIdFrom(cookie: string | undefined, secret: string): Promise<string | null> {
  return cookie ? verifyContributorSession(cookie, secret) : null;
}

/** Guards /contrib/*: 401 without a valid contributor session. Suspension is checked per action. */
export function requireContributor(db: Parameters<typeof getContributor>[0], secret: string) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const id = await contributorIdFrom(getCookie(c, CONTRIBUTOR_COOKIE), secret);
    const contributor = id ? await getContributor(db, id) : undefined;
    if (!contributor) return c.json({ error: "Not signed in" }, 401);
    c.set("contributor", contributor);
    await next();
  });
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

/** The GitHub side of the OAuth web flow. Tests pass a fake. */
export interface GitHubOAuth {
  /** Where to send the browser to authorize. */
  authorizeUrl(state: string, redirectUri: string): string;
  /** Trade the callback's code for the GitHub user. Throws when GitHub says no. */
  exchange(code: string, redirectUri: string): Promise<GitHubUser>;
}

/** The real flow against github.com, with the GitHub App's client id and secret. */
export function createGitHubOAuth(app: { clientId: string; clientSecret: string }, fetchImpl: typeof fetch = fetch): GitHubOAuth {
  return {
    authorizeUrl(state, redirectUri) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", app.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
    },
    async exchange(code, redirectUri) {
      const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri }),
      });
      const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: unknown; error?: unknown };
      if (!tokenRes.ok || typeof token.access_token !== "string") {
        throw new Error(`GitHub token exchange failed: ${String(token.error ?? tokenRes.status)}`);
      }
      const userRes = await fetchImpl("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.access_token}`,
          "User-Agent": "novawerk-api",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      const user = (await userRes.json().catch(() => ({}))) as { id?: unknown; login?: unknown; name?: unknown; avatar_url?: unknown };
      if (!userRes.ok || typeof user.id !== "number" || typeof user.login !== "string") {
        throw new Error(`GitHub user lookup failed: ${userRes.status}`);
      }
      return {
        id: user.id,
        login: user.login,
        name: typeof user.name === "string" ? user.name : null,
        avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
      };
    },
  };
}
