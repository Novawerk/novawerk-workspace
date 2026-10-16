// Signing in with GitHub (src/routes/auth.ts). The session itself is src/auth.ts: one cookie
// for everyone (NB-ADR-0014).
//
// GitHub sign-in is the OAuth web flow of our GitHub App (user authorization) with PKCE (S256).
// We keep GitHub's numeric user id and login, never the access token. The `state` and the PKCE
// verifier travel in a short-lived signed httpOnly cookie, with where to go back to and who to
// link GitHub to when someone signed in by email.

import { createHash } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import type { GitHubUser } from "@nw/tasks";

export const GITHUB_STATE_COOKIE = "nw_github_state";
export const GITHUB_STATE_TTL_SECONDS = 10 * 60;
const STATE_AUDIENCE = "nw-github-state";

/**
 * The path GitHub sends people back to. The GitHub App lists it (prod and localhost), so it keeps
 * its old name; /auth/github/callback answers too.
 */
export const GITHUB_CALLBACK_PATH = "/auth/contributor/github/callback";

const ISSUER = "nw-api";
const keyFrom = (secret: string) => new TextEncoder().encode(secret);

/** What the state cookie carries through GitHub and back. */
export interface GitHubState {
  state: string;
  /** PKCE code verifier; GitHub got its S256 challenge. */
  verifier: string;
  /** A path on the website, or an address on one of our apps. */
  returnTo: string;
  /** Link GitHub to this signed-in account instead of signing in. */
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
    if (typeof payload.state !== "string" || typeof payload.returnTo !== "string" || typeof payload.verifier !== "string") {
      return null;
    }
    return {
      state: payload.state,
      verifier: payload.verifier,
      returnTo: payload.returnTo,
      ...(typeof payload.linkTo === "string" ? { linkTo: payload.linkTo } : {}),
    };
  } catch {
    return null;
  }
}

/** PKCE S256: the challenge for a verifier. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

// ─── GitHub ──────────────────────────────────────────────────────────────────

/** The GitHub side of the OAuth web flow. Tests pass a fake. */
export interface GitHubOAuth {
  /** Where to send the browser to authorize. `codeChallenge` is the PKCE S256 challenge. */
  authorizeUrl(state: string, redirectUri: string, codeChallenge: string): string;
  /** Trade the callback's code (and the PKCE verifier) for the GitHub user. Throws when GitHub says no. */
  exchange(code: string, redirectUri: string, codeVerifier: string): Promise<GitHubUser>;
}

/**
 * The account's primary email, only when GitHub has verified it (the App's "Email addresses: read"
 * permission). Null when there is none, or the call fails: signing in never depends on it.
 */
async function primaryVerifiedEmail(fetchImpl: typeof fetch, accessToken: string): Promise<string | null> {
  try {
    const res = await fetchImpl("https://api.github.com/user/emails", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "novawerk-api",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // The status only: nothing about the person.
      console.warn(`[github] GET /user/emails answered ${res.status}: signing in without an email for notices`);
      return null;
    }
    const emails = (await res.json()) as { email?: unknown; primary?: unknown; verified?: unknown }[];
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary === true && e.verified === true) : undefined;
    return typeof primary?.email === "string" && primary.email.includes("@") ? primary.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The real flow against github.com, with the GitHub App's client id and secret. */
export function createGitHubOAuth(app: { clientId: string; clientSecret: string }, fetchImpl: typeof fetch = fetch): GitHubOAuth {
  return {
    authorizeUrl(state, redirectUri, codeChallenge) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", app.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },
    async exchange(code, redirectUri, codeVerifier) {
      const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: app.clientId,
          client_secret: app.clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
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
        email: await primaryVerifiedEmail(fetchImpl, token.access_token),
      };
    },
  };
}
