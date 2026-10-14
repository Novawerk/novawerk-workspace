// Newsletter mail. Two pieces:
//
// - sendNewsletterConfirmation(): the double opt-in email. Like sendSignInCode() it can't wait
//   in the outbox (the person is on the page right now), so it is fixed: the wording never
//   changes, only the confirmation link goes in, and it goes to the address that just asked for
//   it. The API rate-limits it per address. NB-ADR-0011.
// - newsletterUnsubscribe(): the List-Unsubscribe headers and footer link for one subscriber,
//   for whatever sends an issue later. Issues themselves are not sent from here.

import { Resend } from "resend";

import { NEWSLETTER_CONFIRM_TTL_HOURS, NEWSLETTER_PATHS } from "@nw/contracts";

export interface NewsletterConfirmationOptions {
  /** If missing, the link is logged instead of sent (local development only). */
  resendApiKey?: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
}

/** Where the API and the website live, e.g. https://api.novawerk.io and https://novawerk.io. */
export interface NewsletterUrls {
  apiUrl: string;
  webUrl: string;
}

const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;
const CONFIRM_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An http(s) origin with no trailing slash. Refuses anything else, so no link can point elsewhere. */
function origin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`Not a web address: ${url}`);
  return parsed.origin;
}

/** The link in the confirmation email. */
export function newsletterConfirmUrl(apiUrl: string, token: string): string {
  if (!CONFIRM_TOKEN.test(token)) throw new Error("newsletterConfirmUrl(): not a confirmation token.");
  return `${origin(apiUrl)}${NEWSLETTER_PATHS.confirm}?token=${token}`;
}

/** The email, in both our languages. Only the link varies. */
export function newsletterConfirmationEmail(confirmUrl: string): { subject: string; text: string } {
  return {
    subject: "Confirm your Novawerk newsletter subscription",
    text:
      `Someone, hopefully you, asked to get the Novawerk newsletter at this address.\n\n` +
      `To confirm, open this link:\n${confirmUrl}\n\n` +
      `It works for ${NEWSLETTER_CONFIRM_TTL_HOURS} hours. If you didn't ask, ignore this email. ` +
      `We won't add you, and we won't write again.\n\n` +
      `有人（希望是你）用这个邮箱订阅了 Novawerk 的通讯。\n` +
      `确认订阅请打开上面的链接，${NEWSLETTER_CONFIRM_TTL_HOURS} 小时内有效。` +
      `如果不是你本人操作，请忽略这封邮件，我们不会再给你写信。\n\n` +
      `Novawerk\nhttps://novawerk.io\n`,
  };
}

export async function sendNewsletterConfirmation(
  to: string,
  confirmUrl: string,
  opts: NewsletterConfirmationOptions,
): Promise<{ mode: "sent"; id: string } | { mode: "logged" }> {
  if (!SINGLE_ADDRESS.test(to.trim())) throw new Error(`sendNewsletterConfirmation(): "${to}" is not a single email address.`);
  const url = new URL(confirmUrl);
  if (
    url.pathname !== NEWSLETTER_PATHS.confirm ||
    [...url.searchParams.keys()].join() !== "token" ||
    !CONFIRM_TOKEN.test(url.searchParams.get("token") ?? "") ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("sendNewsletterConfirmation(): the link must be a newsletter confirmation link.");
  }
  const email = newsletterConfirmationEmail(`${origin(confirmUrl)}${url.pathname}${url.search}`);
  if (!opts.resendApiKey) {
    console.log(`[sendNewsletterConfirmation] RESEND_API_KEY not set — confirmation link for ${to}: ${confirmUrl}`);
    return { mode: "logged" };
  }
  const { data, error } = await new Resend(opts.resendApiKey).emails.send({
    from: opts.from,
    to: to.trim(),
    subject: email.subject,
    text: email.text,
  });
  if (error) throw new Error(`sendNewsletterConfirmation() failed at Resend: ${error.message}`);
  return { mode: "sent", id: data!.id };
}

export interface NewsletterUnsubscribe {
  /** Put both on every issue (RFC 2369 and RFC 8058 one-click). */
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  /** The footer link: a page on the website with an Unsubscribe button. */
  url: string;
  /** The footer, plain text, in both our languages. */
  footerText: string;
}

/**
 * The unsubscribe parts of one issue for one subscriber, from their `unsubscribeToken`.
 * The header points at the API, which unsubscribes on POST only: mail scanners that open links
 * with GET can't unsubscribe anyone.
 */
export function newsletterUnsubscribe(unsubscribeToken: string, urls: NewsletterUrls): NewsletterUnsubscribe {
  if (!UUID.test(unsubscribeToken)) throw new Error("newsletterUnsubscribe(): not an unsubscribe token.");
  const token = unsubscribeToken.toLowerCase();
  const url = `${origin(urls.webUrl)}${NEWSLETTER_PATHS.unsubscribe}?token=${token}`;
  return {
    headers: {
      "List-Unsubscribe": `<${origin(urls.apiUrl)}${NEWSLETTER_PATHS.unsubscribeApi}?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    url,
    footerText:
      `You get this because you subscribed on novawerk.io. Unsubscribe: ${url}\n` +
      `你收到这封邮件，是因为你在 novawerk.io 订阅了通讯。退订：${url}\n`,
  };
}
