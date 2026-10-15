// /auth/contributor: contributors sign in with GitHub, or with a code we email. Signing in
// creates a contributor account; it isn't Novawerk membership (NB-ADR-0013). Members sign in at
// /auth (src/routes/auth.ts); the two sessions never mix.
//
//   GET  /auth/contributor/github/start?returnTo=/tasks/NW-42  → 302 to GitHub
//   GET  /auth/contributor/github/callback?code&state          → 302 back to the website, cookie set
//   POST /auth/contributor/email/start   { email }             → { ok } always
//   POST /auth/contributor/email/verify  { email, code }       → the contributor, and the cookie
//   GET  /auth/contributor/me                                  → the contributor (owner view) or 401
//   POST /auth/contributor/logout                             ends every session of this contributor
//
// Signed in by email and pressing "Link GitHub" goes through the same GitHub start: the callback
// then adds GitHub to that account. Proposing or working on a task needs GitHub linked.

import { randomBytes, timingSafeEqual } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { contributorEmailStartInput, contributorEmailVerifyInput, githubStartQuery } from "@nw/contracts";
import { revokeSessions, signInWithEmail, signInWithGitHub, toContributorMe, TaskRuleError } from "@nw/tasks";

import { sessionCookieOptions } from "../auth.js";
import {
  CONTRIBUTOR_COOKIE,
  CONTRIBUTOR_SESSION_TTL_SECONDS,
  GITHUB_CALLBACK_PATH,
  GITHUB_STATE_COOKIE,
  GITHUB_STATE_TTL_SECONDS,
  currentContributor,
  pkceChallenge,
  signContributorSession,
  signGitHubState,
  verifyGitHubState,
} from "../contributor-auth.js";
import { rejectInvalid, validationFailed } from "../http.js";
import { FixedWindowLimiter, clientIp } from "../intake-chat/rate-limit.js";
import { VERIFY_TRIES_PER_IP_PER_HOUR, checkCode, issueCode } from "../sign-in-codes.js";
import type { ApiEnv, AppDeps, Logger } from "../types.js";

/** Code requests per client IP per hour (in-memory, per instance). Per address: src/sign-in-codes.ts. */
export const CODE_REQUESTS_PER_HOUR = 10;

const DEFAULT_RETURN = "/tasks";
const GITHUB_OFF = "Signing in with GitHub isn't set up here. Use an email code.";

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function contributorAuthRoutes({ db, env, logger, githubOAuth, sendContributorSignInCode }: AppDeps & { logger: Logger }) {
  const codeRequests = new FixedWindowLimiter(CODE_REQUESTS_PER_HOUR, 60 * 60_000);
  const verifyTries = new FixedWindowLimiter(VERIFY_TRIES_PER_IP_PER_HOUR, 60 * 60_000);
  const webPage = (path: string) => `${env.publicUrls.webUrl}${path}`;
  const redirectUri = `${env.publicUrls.apiUrl}${GITHUB_CALLBACK_PATH}`;

  return new Hono<ApiEnv>()
    .get("/github/start", zValidator("query", githubStartQuery, rejectInvalid), async (c) => {
      if (!githubOAuth) return c.json({ error: GITHUB_OFF }, 503);
      const state = randomBytes(24).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      const linkTo = (await currentContributor(db, getCookie(c, CONTRIBUTOR_COOKIE), env.sessionSecret))?.id;
      const token = await signGitHubState(
        { state, verifier, returnTo: c.req.valid("query").returnTo ?? DEFAULT_RETURN, ...(linkTo ? { linkTo } : {}) },
        env.sessionSecret,
      );
      setCookie(c, GITHUB_STATE_COOKIE, token, {
        ...sessionCookieOptions(c, GITHUB_STATE_TTL_SECONDS),
        path: "/auth/contributor/github",
      });
      return c.redirect(githubOAuth.authorizeUrl(state, redirectUri, pkceChallenge(verifier)), 302);
    })

    .get("/github/callback", async (c) => {
      if (!githubOAuth) return c.json({ error: GITHUB_OFF }, 503);
      const saved = await verifyGitHubState(getCookie(c, GITHUB_STATE_COOKIE) ?? "", env.sessionSecret);
      deleteCookie(c, GITHUB_STATE_COOKIE, { ...sessionCookieOptions(c, 0), path: "/auth/contributor/github" });
      const { code, state } = c.req.query();
      if (!saved || !code || !state || !sameString(state, saved.state)) {
        return c.redirect(webPage("/sign-in?error=github"), 302);
      }
      try {
        const user = await githubOAuth.exchange(code, redirectUri, saved.verifier);
        const contributor = await signInWithGitHub(db, user, saved.linkTo);
        setCookie(
          c,
          CONTRIBUTOR_COOKIE,
          await signContributorSession(contributor.id, env.sessionSecret),
          sessionCookieOptions(c, CONTRIBUTOR_SESSION_TTL_SECONDS),
        );
        return c.redirect(webPage(saved.returnTo), 302);
      } catch (err) {
        if (err instanceof TaskRuleError && err.code === "conflict") {
          return c.redirect(webPage("/settings?error=github-linked-elsewhere"), 302);
        }
        logger.warn("[api] GitHub sign-in failed:", err instanceof Error ? err.message : err);
        return c.redirect(webPage("/sign-in?error=github"), 302);
      }
    })

    // Anyone may ask: the code creates an account on first use. The answer is the same whether
    // or not the address has an account, or asked too often.
    .post("/email/start", zValidator("json", contributorEmailStartInput, rejectInvalid), async (c) => {
      if (!sendContributorSignInCode) return c.json({ error: "Signing in by email isn't set up here." }, 503);
      if (!codeRequests.take(clientIp(c))) {
        return c.json({ error: "Too many codes from your network. Please try again later." }, 429);
      }
      const { email } = c.req.valid("json");
      const code = await issueCode(db, email, env.sessionSecret, new Date(), "contributor");
      if (code) {
        await sendContributorSignInCode(email, code).catch((err: unknown) =>
          logger.error("[api] could not email a contributor sign-in code:", err),
        );
      }
      return c.json({ ok: true as const }, 200);
    })

    .post("/email/verify", zValidator("json", contributorEmailVerifyInput, rejectInvalid), async (c) => {
      if (!verifyTries.take(clientIp(c))) {
        return c.json({ error: "Too many tries from your network. Please try again later." }, 429);
      }
      const { email, code } = c.req.valid("json");
      if (!(await checkCode(db, email, code, env.sessionSecret, new Date(), "contributor"))) {
        return c.json(validationFailed({ code: ["That code is wrong or has expired"] }), 400);
      }
      const contributor = await signInWithEmail(db, email);
      setCookie(
        c,
        CONTRIBUTOR_COOKIE,
        await signContributorSession(contributor.id, env.sessionSecret),
        sessionCookieOptions(c, CONTRIBUTOR_SESSION_TTL_SECONDS),
      );
      return c.json(toContributorMe(contributor), 200);
    })

    .get("/me", async (c) => {
      const contributor = await currentContributor(db, getCookie(c, CONTRIBUTOR_COOKIE), env.sessionSecret);
      if (!contributor) return c.json({ error: "Not signed in" }, 401);
      return c.json(toContributorMe(contributor), 200);
    })

    // Ends this session and every other one (a copied cookie stops working too).
    .post("/logout", async (c) => {
      const contributor = await currentContributor(db, getCookie(c, CONTRIBUTOR_COOKIE), env.sessionSecret);
      if (contributor) await revokeSessions(db, contributor.id);
      deleteCookie(c, CONTRIBUTOR_COOKIE, sessionCookieOptions(c, 0));
      return c.json({ ok: true as const }, 200);
    });
}
