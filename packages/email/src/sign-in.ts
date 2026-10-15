// sendSignInCode — the third door, and the narrowest: a one-time sign-in code to the address that
// is signing in. It can't wait in the outbox (the person is signing in right now), so it is fixed:
// the wording never changes and only a 6-digit code goes in. The API calls it for an active
// member's registered email, and for a contributor signing in by email (NB-ADR-0013), rate-limited
// per address and per network. Agents never get the Resend key, so they can't reach it.

import { Resend } from "resend";

export interface SignInCodeOptions {
  /** If missing, the code is logged instead of sent (local development only). */
  resendApiKey?: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
}

const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;
export const SIGN_IN_CODE_PATTERN = /^\d{6}$/;

/** The email, in both our languages. Only the code varies. */
export function signInCodeEmail(code: string): { subject: string; text: string } {
  return {
    subject: `Your Novawerk sign-in code: ${code}`,
    text:
      `Your code to sign in to Novawerk: ${code}\n\n` +
      `It works for 10 minutes. If you didn't ask for it, ignore this email.\n\n` +
      `你的 Novawerk 登录验证码：${code}\n` +
      `10 分钟内有效。如果不是你本人操作，请忽略这封邮件。\n\n` +
      `Novawerk\nhttps://novawerk.io\n`,
  };
}

export async function sendSignInCode(
  to: string,
  code: string,
  opts: SignInCodeOptions,
): Promise<{ mode: "sent"; id: string } | { mode: "logged" }> {
  if (!SINGLE_ADDRESS.test(to.trim())) throw new Error(`sendSignInCode(): "${to}" is not a single email address.`);
  if (!SIGN_IN_CODE_PATTERN.test(code)) throw new Error("sendSignInCode(): a code is 6 digits.");
  const email = signInCodeEmail(code);
  if (!opts.resendApiKey) {
    console.log(`[sendSignInCode] RESEND_API_KEY not set — sign-in code for ${to}: ${code}`);
    return { mode: "logged" };
  }
  const { data, error } = await new Resend(opts.resendApiKey).emails.send({
    from: opts.from,
    to: to.trim(),
    subject: email.subject,
    text: email.text,
  });
  if (error) throw new Error(`sendSignInCode() failed at Resend: ${error.message}`);
  return { mode: "sent", id: data!.id };
}
