// /auth: sign in with a Google ID token, or with a code we email (members without Google), and
// sign out. Any active member may sign in; what they can see is decided per route.
//
//   POST /auth/google        { credential }      → the member, and the session cookie
//   POST /auth/email/start   { email }           → { ok } always (a code goes out if it is a member)
//   POST /auth/email/verify  { email, code }     → the member, and the session cookie
//   POST /auth/dev           { email }           local development only
//   POST /auth/logout

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import {
  SESSION_COOKIE,
  findMemberByEmail,
  sessionCookieOptions,
  signSession,
} from "../auth.js";
import { rejectInvalid, validationFailed } from "../http.js";
import { FixedWindowLimiter, clientIp } from "../intake-chat/rate-limit.js";
import { VERIFY_TRIES_PER_IP_PER_HOUR, checkCode, issueCode } from "../sign-in-codes.js";
import { toAdminMember, type ApiEnv, type AppDeps, type GoogleVerifier, type Logger } from "../types.js";

const googleSignInInput = z.object({ credential: z.string().min(1).max(8192) });
const emailField = z.string().trim().toLowerCase().max(200).pipe(z.email("That doesn't look like an email address"));
const devSignInInput = z.object({ email: emailField });
const emailStartInput = z.object({ email: emailField });
const emailVerifyInput = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, "Six digits") });

export function authRoutes({
  db,
  env,
  logger,
  verifyGoogleToken,
  sendSignInCode,
}: AppDeps & { logger: Logger; verifyGoogleToken: GoogleVerifier }) {
  const verifyTries = new FixedWindowLimiter(VERIFY_TRIES_PER_IP_PER_HOUR, 60 * 60_000);
  return new Hono<ApiEnv>()
    .post("/google", zValidator("json", googleSignInInput, rejectInvalid), async (c) => {
      let email: string;
      try {
        ({ email } = await verifyGoogleToken(c.req.valid("json").credential));
      } catch (err) {
        logger.warn("[api] Google sign-in rejected:", err instanceof Error ? err.message : err);
        return c.json({ error: "Google sign-in failed" }, 403);
      }

      const member = await findMemberByEmail(db, email);
      if (!member) return c.json({ error: "This Google account is not a Novawerk member" }, 403);

      setCookie(c, SESSION_COOKIE, await signSession(member.id, env.sessionSecret), sessionCookieOptions(c));
      return c.json(toAdminMember(member), 200);
    })

    .post("/email/start", zValidator("json", emailStartInput, rejectInvalid), async (c) => {
      if (!sendSignInCode) return c.json({ error: "Signing in by email isn't set up here. Use Google." }, 503);
      const { email } = c.req.valid("json");
      // The same answer either way, so nobody can use this to find out who is a member.
      const member = await findMemberByEmail(db, email);
      if (member) {
        const code = await issueCode(db, member.email, env.sessionSecret);
        if (code) {
          await sendSignInCode(member.email, code).catch((err) =>
            logger.error(`[api] could not email a sign-in code to member ${member.id}:`, err),
          );
        }
      }
      return c.json({ ok: true as const }, 200);
    })

    .post("/email/verify", zValidator("json", emailVerifyInput, rejectInvalid), async (c) => {
      if (!verifyTries.take(clientIp(c))) {
        return c.json({ error: "Too many tries from your network. Please try again later." }, 429);
      }
      const { email, code } = c.req.valid("json");
      if (!(await checkCode(db, email, code, env.sessionSecret))) {
        return c.json(validationFailed({ code: ["That code is wrong or has expired"] }), 400);
      }
      const member = await findMemberByEmail(db, email);
      if (!member) return c.json({ error: "This email is not a Novawerk member" }, 403);
      setCookie(c, SESSION_COOKIE, await signSession(member.id, env.sessionSecret), sessionCookieOptions(c));
      return c.json(toAdminMember(member), 200);
    })

    // Local development only (DEV_LOGIN=true, never on Vercel): sign in as any member by email.
    .post("/dev", zValidator("json", devSignInInput, rejectInvalid), async (c) => {
      if (!env.devLogin) return c.json({ error: "Not found" }, 404);
      const member = await findMemberByEmail(db, c.req.valid("json").email);
      if (!member) return c.json({ error: "No active member with that email" }, 403);
      logger.warn(`[api] DEV_LOGIN: signed in ${member.id} without Google`);
      setCookie(c, SESSION_COOKIE, await signSession(member.id, env.sessionSecret), sessionCookieOptions(c));
      return c.json(toAdminMember(member), 200);
    })

    .post("/logout", (c) => {
      deleteCookie(c, SESSION_COOKIE, sessionCookieOptions(c, 0));
      return c.json({ ok: true as const }, 200);
    });
}
