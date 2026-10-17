// /auth: one sign-in for everyone (NB-ADR-0014). GitHub, Google or a code we email; an account can
// link more than one. Signing in the first time creates the account. What someone may do is
// decided per route (src/auth.ts), never here.
//
//   GET  /auth/github/start?returnTo=/tasks/NW-42  → 302 to GitHub (signed in: links GitHub)
//   GET  /auth/github/callback?code&state          → 302 back, session cookie set
//   POST /auth/google        { credential, link? } → the account, and the session cookie
//   POST /auth/email/start   { email }             → { ok } always
//   POST /auth/email/verify  { email, code, link? } → the account, and the session cookie
//   GET  /auth/me                                  → the account (owner view) or 401
//   POST /auth/logout                              ends every session of this account
//   GET  /auth/chat                                → 302 to Novawerk Chat with a 60 s ticket (src/chat-sso.ts)
//   POST /auth/dev           { email }             local development only
//
// `link: true` adds the address to the signed-in account instead of signing in to another one.
// The same routes answer under /auth/contributor (the paths of the two-account days, and the
// GitHub App's callback).

import { randomBytes, timingSafeEqual } from "node:crypto";

import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import { emailStartInput, emailVerifyInput, githubStartQuery, googleSignInInput, type AccountMe } from "@nw/contracts";
import { members, type Database, type Member } from "@nw/db";
import {
  TaskRuleError,
  revokeSessions,
  signInWithGitHub,
  signInWithVerifiedEmail,
  toContributorMe,
} from "@nw/tasks";

import {
  SESSION_COOKIE,
  currentAccount,
  findMemberByEmail,
  mayOpenAdminPanel,
  sessionCookieOptions,
  startSession,
} from "../auth.js";
import {
  GITHUB_CALLBACK_PATH,
  GITHUB_STATE_COOKIE,
  GITHUB_STATE_TTL_SECONDS,
  pkceChallenge,
  signGitHubState,
  verifyGitHubState,
} from "../github-auth.js";
import { CHAT_SSO_PATH, chatProfile, chatRefusal, signChatTicket } from "../chat-sso.js";
import { rejectInvalid, validationFailed } from "../http.js";
import { FixedWindowLimiter, clientIp } from "../intake-chat/rate-limit.js";
import { VERIFY_TRIES_PER_IP_PER_HOUR, checkCode, issueCode } from "../sign-in-codes.js";
import type { ApiEnv, AppDeps, GoogleVerifier, Logger } from "../types.js";
import { welcomeOnce } from "../welcome.js";

/** Code requests per client IP per hour (in-memory, per instance). Per address: src/sign-in-codes.ts. */
export const CODE_REQUESTS_PER_HOUR = 10;

const DEFAULT_RETURN = "/tasks";
const GITHUB_OFF = "Signing in with GitHub isn't set up here. Use Google or an email code.";

const devSignInInput = z.object({ email: z.string().trim().toLowerCase().max(200).pipe(z.email()) });

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The signed-in account as its owner sees it. */
export async function toAccountMe(db: Database, account: Member): Promise<AccountMe> {
  return { ...toContributorMe(account), adminPanel: await mayOpenAdminPanel(db, account) };
}

export function authRoutes({
  db,
  env,
  logger,
  githubOAuth,
  verifyGoogleToken,
  sendSignInCode,
  sendWelcome,
}: AppDeps & { logger: Logger; verifyGoogleToken: GoogleVerifier }) {
  const codeRequests = new FixedWindowLimiter(CODE_REQUESTS_PER_HOUR, 60 * 60_000);
  const verifyTries = new FixedWindowLimiter(VERIFY_TRIES_PER_IP_PER_HOUR, 60 * 60_000);
  const redirectUri = `${env.publicUrls.apiUrl}${GITHUB_CALLBACK_PATH}`;
  // Where a sign-in may send people back to: the website, and our own apps.
  const appOrigins = new Set(
    [...env.adminOrigins, ...(env.returnOrigins ?? []), ...(env.chatSso ? [env.chatSso.url] : [])].map((o) => new URL(o).origin),
  );
  const returnUrl = (returnTo: string) => {
    if (returnTo.startsWith("/")) return `${env.publicUrls.webUrl}${returnTo}`;
    const url = new URL(returnTo);
    return appOrigins.has(url.origin) ? url.toString() : `${env.publicUrls.webUrl}${DEFAULT_RETURN}`;
  };
  const signedIn = (c: Context<ApiEnv>) => currentAccount(db, getCookie(c, SESSION_COOKIE), env.sessionSecret);

  /** Session and answer for an account someone just proved is theirs (and a new one's welcome). */
  const welcome = async (c: Context<ApiEnv>, account: Member) => {
    await welcomeOnce(db, account, sendWelcome, logger);
    await startSession(c, account.id, env.sessionSecret);
    return c.json(await toAccountMe(db, account), 200);
  };

  return new Hono<ApiEnv>()
    .get("/github/start", zValidator("query", githubStartQuery, rejectInvalid), async (c) => {
      if (!githubOAuth) return c.json({ error: GITHUB_OFF }, 503);
      const state = randomBytes(24).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      const linkTo = (await signedIn(c))?.id;
      const token = await signGitHubState(
        { state, verifier, returnTo: c.req.valid("query").returnTo ?? DEFAULT_RETURN, ...(linkTo ? { linkTo } : {}) },
        env.sessionSecret,
      );
      // Path /auth: the callback answers under /auth/github and /auth/contributor/github.
      setCookie(c, GITHUB_STATE_COOKIE, token, { ...sessionCookieOptions(c, GITHUB_STATE_TTL_SECONDS), path: "/auth" });
      return c.redirect(githubOAuth.authorizeUrl(state, redirectUri, pkceChallenge(verifier)), 302);
    })

    .get("/github/callback", async (c) => {
      if (!githubOAuth) return c.json({ error: GITHUB_OFF }, 503);
      const saved = await verifyGitHubState(getCookie(c, GITHUB_STATE_COOKIE) ?? "", env.sessionSecret);
      deleteCookie(c, GITHUB_STATE_COOKIE, { ...sessionCookieOptions(c, 0), path: "/auth" });
      const { code, state } = c.req.query();
      if (!saved || !code || !state || !sameString(state, saved.state)) {
        return c.redirect(returnUrl("/sign-in?error=github"), 302);
      }
      try {
        const user = await githubOAuth.exchange(code, redirectUri, saved.verifier);
        const account = await signInWithGitHub(db, user, saved.linkTo);
        if (!account.active) return c.redirect(returnUrl("/sign-in?error=inactive"), 302);
        await welcomeOnce(db, account, sendWelcome, logger);
        await startSession(c, account.id, env.sessionSecret);
        return c.redirect(returnUrl(saved.returnTo), 302);
      } catch (err) {
        if (err instanceof TaskRuleError && err.code === "conflict") {
          return c.redirect(returnUrl("/settings?error=github-linked-elsewhere"), 302);
        }
        logger.warn("[api] GitHub sign-in failed:", err instanceof Error ? err.message : err);
        return c.redirect(returnUrl("/sign-in?error=github"), 302);
      }
    })

    .post("/google", zValidator("json", googleSignInInput, rejectInvalid), async (c) => {
      const { credential, link } = c.req.valid("json");
      let identity: Awaited<ReturnType<GoogleVerifier>>;
      try {
        identity = await verifyGoogleToken(credential);
      } catch (err) {
        logger.warn("[api] Google sign-in rejected:", err instanceof Error ? err.message : err);
        return c.json({ error: "Google sign-in failed" }, 403);
      }
      const linkTo = link ? (await signedIn(c))?.id : undefined;
      if (link && !linkTo) return c.json({ error: "Not signed in" }, 401);
      const account = await signInWithVerifiedEmail(db, identity.email, { name: identity.name ?? null, linkTo });
      if (!account.active) return c.json({ error: "This account is closed" }, 403);
      return welcome(c, account);
    })

    // Anyone may ask: the code creates an account on first use. The answer is the same whether
    // or not the address has an account, or asked too often.
    .post("/email/start", zValidator("json", emailStartInput, rejectInvalid), async (c) => {
      if (!sendSignInCode) return c.json({ error: "Signing in by email isn't set up here." }, 503);
      if (!codeRequests.take(clientIp(c))) {
        return c.json({ error: "Too many codes from your network. Please try again later." }, 429);
      }
      const { email } = c.req.valid("json");
      // A closed account gets nothing (and the same answer).
      const [closed] = await db
        .select({ id: members.id })
        .from(members)
        .where(and(sql`lower(${members.email}) = ${email}`, eq(members.active, false)))
        .limit(1);
      const code = closed ? null : await issueCode(db, email, env.sessionSecret);
      if (code) {
        await sendSignInCode(email, code).catch((err: unknown) => logger.error("[api] could not email a sign-in code:", err));
      }
      return c.json({ ok: true as const }, 200);
    })

    .post("/email/verify", zValidator("json", emailVerifyInput, rejectInvalid), async (c) => {
      if (!verifyTries.take(clientIp(c))) {
        return c.json({ error: "Too many tries from your network. Please try again later." }, 429);
      }
      const { email, code, link } = c.req.valid("json");
      const linkTo = link ? (await signedIn(c))?.id : undefined;
      if (link && !linkTo) return c.json({ error: "Not signed in" }, 401);
      if (!(await checkCode(db, email, code, env.sessionSecret))) {
        return c.json(validationFailed({ code: ["That code is wrong or has expired"] }), 400);
      }
      const account = await signInWithVerifiedEmail(db, email, { linkTo });
      if (!account.active) return c.json({ error: "This account is closed" }, 403);
      return welcome(c, account);
    })

    .get("/me", async (c) => {
      const account = await signedIn(c);
      if (!account) return c.json({ error: "Not signed in" }, 401);
      return c.json(await toAccountMe(db, account), 200);
    })

    // Novawerk Chat signs in through here (NB-ADR-0014). Signed out: the website's sign-in, which
    // sends people back to the chat, which comes back here. A closed or suspended account, or one
    // without an address yet, goes to Settings, which says why.
    .get("/chat", async (c) => {
      if (!env.chatSso) return c.json({ error: "Not found" }, 404);
      const account = await signedIn(c);
      const signInFirst = `${env.publicUrls.webUrl}/sign-in?returnTo=${encodeURIComponent(`${env.chatSso.url}/`)}`;
      if (!account) return c.redirect(signInFirst, 302);
      const refusal = chatRefusal(account);
      if (refusal) return c.redirect(`${env.publicUrls.webUrl}/settings?error=chat-${refusal}`, 302);
      // A new account sets itself up first (handle, pledge) on novawerk.io: the sign-in page shows
      // the setup and only then comes back here. Otherwise the chat would take the placeholder handle.
      const me = toContributorMe(account);
      if (me.defaultHandle || !me.pledgeAccepted) return c.redirect(signInFirst, 302);
      const ticket = await signChatTicket(account, await chatProfile(db, account, env.publicUrls.webUrl), env.chatSso.secret);
      c.header("Cache-Control", "no-store");
      c.header("Referrer-Policy", "no-referrer");
      return c.redirect(`${env.chatSso.url}${CHAT_SSO_PATH}?ticket=${encodeURIComponent(ticket)}`, 302);
    })

    // Ends this session and every other one (a copied cookie stops working too).
    .post("/logout", async (c) => {
      const account = await signedIn(c);
      if (account) await revokeSessions(db, account.id);
      deleteCookie(c, SESSION_COOKIE, sessionCookieOptions(c, 0));
      return c.json({ ok: true as const }, 200);
    })

    // Local development only (DEV_LOGIN=true, never on Vercel): sign in as any account by email.
    .post("/dev", zValidator("json", devSignInInput, rejectInvalid), async (c) => {
      if (!env.devLogin) return c.json({ error: "Not found" }, 404);
      const account = await findMemberByEmail(db, c.req.valid("json").email);
      if (!account) return c.json({ error: "No active account with that email" }, 403);
      logger.warn(`[api] DEV_LOGIN: signed in ${account.id} without a password`);
      return welcome(c, account);
    });
}
