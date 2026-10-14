// Mail to info@novawerk.io, shown in Slack. The Google group "Novawerk Info" has one extra
// member: an address on Resend's receiving domain. For each email Resend calls
// POST /webhooks/resend; we check the signature, fetch the email from Resend and post it to a
// Slack channel through an incoming webhook. Nothing is stored here. Gmail stays the inbox,
// and replies go from there. Setup: docs/infra.md, "info@ in Slack".

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { InboundMailOptions } from "./types.js";

/** Resend signs with Svix. A delivery older or newer than this is refused (replay guard). */
const SIGNATURE_TOLERANCE_S = 5 * 60;
const TIMEOUT_MS = 10_000;
/** Enough to triage in Slack. The full email is in Gmail. */
const BODY_PREVIEW_CHARS = 1_500;
/** Slack's limits: a container's title and subtitle 150, any other text object 3000. */
const TITLE_MAX = 150;
const TEXT_MAX = 3_000;

export interface SignatureHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

/**
 * Svix's scheme: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`, keyed with the base64 part
 * of the `whsec_…` secret. The header lists one or more `v1,<signature>` separated by spaces.
 */
export function verifyResendSignature(
  secret: string,
  { id, timestamp, signature }: SignatureHeaders,
  body: string,
  now = Date.now(),
): boolean {
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(now / 1000 - sentAt) > SIGNATURE_TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const webhookEventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string().optional() }).optional(),
});

/** The fields we use from GET /emails/receiving/:id. */
const receivedEmailSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.array(z.string()).nullish(),
  reply_to: z.array(z.string()).nullish(),
  subject: z.string().nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
  headers: z.record(z.string(), z.unknown()).nullish(),
  message_id: z.string().nullish(),
  attachments: z.array(z.object({ filename: z.string().nullish() })).nullish(),
});

export type ReceivedEmail = z.infer<typeof receivedEmailSchema>;

export async function fetchReceivedEmail(
  id: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReceivedEmail> {
  // `cid` keeps inline images out of `html`; we never show them.
  const res = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}?html_format=cid`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  return receivedEmailSchema.parse(await res.json());
}

const rawHeader = (email: ReceivedEmail, name: string): unknown =>
  Object.entries(email.headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

function header(email: ReceivedEmail, name: string): string | undefined {
  const value = rawHeader(email, name);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(", ");
  return undefined;
}

/**
 * The list ids an email carries. Resend parses `List-ID: <info.novawerk.io>` into a `list`
 * header, `{"id":{"name":"info.novawerk.io"}}`, which may arrive as a JSON string. A plain
 * `list-id` header counts too.
 */
function listIds(email: ReceivedEmail): string[] {
  const ids: unknown[] = [];
  const listId = header(email, "list-id");
  if (listId) ids.push(listId.match(/<([^>]+)>/)?.[1] ?? listId);
  let list = rawHeader(email, "list");
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = undefined;
    }
  }
  const id = (list as { id?: unknown } | null | undefined)?.id;
  if (typeof id === "string") ids.push(id);
  else if (id && typeof id === "object") ids.push(...Object.values(id));
  return ids.flatMap((v) => (typeof v === "string" ? [v.trim().replace(/^<|>$/g, "").toLowerCase()] : []));
}

/**
 * Google Groups stamps its list id on what it hands to members. Resend's receiving domain
 * accepts mail for any address, so this is how we know the group sent it.
 */
export function cameThroughList(email: ReceivedEmail, listId: string): boolean {
  return listIds(email).includes(listId.toLowerCase());
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Good enough to read an HTML-only email in Slack. Not a sanitizer: Slack gets escaped text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Where Google Groups' footer starts, in either of its forms. */
const GROUPS_FOOTER =
  /\n(?:--\s*\n)?(?:You received this message because you are subscribed to the Google Groups|To unsubscribe from this group and stop receiving emails from it)/;

/** Mail clients wrap plain text at about 76 characters. A line this long was probably wrapped. */
const WRAPPED_LINE = 60;
/** A line that starts a list item or a quote, or is the signature marker: never joined. */
const OWN_LINE = /^\s*(?:[-*•>]|\d+[.)])(?:\s|$)/;

/** Joins the lines a mail client wrapped, and keeps paragraphs, lists and quotes. */
export function unwrap(text: string): string {
  const out: string[] = [];
  let previous = "";
  for (const line of text.split("\n")) {
    const joins = out.length > 0 && previous.length >= WRAPPED_LINE && line.trim() !== "" && !OWN_LINE.test(line);
    if (joins && !OWN_LINE.test(previous)) out[out.length - 1] += ` ${line.trimStart()}`;
    else out.push(line);
    previous = line;
  }
  return out.join("\n");
}

/** The body without the Google Groups footer. Plain text is unwrapped; HTML has no hard wraps. */
export function bodyText(email: ReceivedEmail): string {
  const text = email.text?.trim()
    ? unwrap(email.text.replace(/\r\n/g, "\n"))
    : email.html
      ? htmlToText(email.html)
      : "";
  return text.split(GROUPS_FOOTER)[0]!.trim();
}

/** Slack mrkdwn: only &, < and > need escaping, and escaping < also stops <!channel>. */
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Cut to `max` characters. Escaped mrkdwn is never cut in the middle of an escape. */
function clip(s: string, max: number, escaped = false): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${escaped ? cut.replace(/&[a-z]{0,3}$/, "") : cut}…`;
}

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

/**
 * One card per email: a Slack container block with the subject as title, "sender → recipient"
 * as subtitle, the body as rich text, then a line with Reply-To, attachments and a Gmail link.
 * Rich text is shown as typed, so the sender can't ping the channel or hide a link; only that
 * last mrkdwn line needs escaping. No emoji in the title (containers show the :code:) and no
 * button (our Slack app has no interactivity, so Slack flags a click with a warning).
 */
export function slackMessage(email: ReceivedEmail): SlackMessage {
  const subject = email.subject?.replace(/\s+/g, " ").trim() || "(no subject)";
  // The headers say who wrote to whom; `to` is our receiving address.
  const from = (header(email, "from") ?? email.from).replace(/^"([^"]*)"\s*</, "$1 <");
  const to = header(email, "to") ?? (email.to?.length ? email.to.join(", ") : "—");
  const replyTo = email.reply_to?.filter((a) => !from.includes(a)) ?? [];
  const body = bodyText(email);
  const preview = body.length > BODY_PREVIEW_CHARS ? `${body.slice(0, BODY_PREVIEW_CHARS)}…` : body;
  const files = (email.attachments ?? []).map((a) => a.filename || "unnamed");
  const messageId = (email.message_id ?? header(email, "message-id"))?.replace(/^<|>$/g, "");

  const extras: string[] = [];
  if (replyTo.length) extras.push(`*Reply-To:* ${escape(replyTo.join(", "))}`);
  if (files.length) {
    extras.push(escape(`📎 ${files.length === 1 ? "1 attachment" : `${files.length} attachments`}: ${files.join(", ")}`));
  }
  extras.push(
    messageId
      ? `<https://mail.google.com/mail/#search/rfc822msgid%3A${encodeURIComponent(messageId)}|Open in Gmail> and reply from there`
      : "Reply from Gmail",
  );

  const children: unknown[] = [];
  if (preview) {
    children.push({ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "text", text: preview }] }] });
  }
  children.push({ type: "context", elements: [{ type: "mrkdwn", text: clip(extras.join("\n"), TEXT_MAX, true) }] });

  return {
    // Notifications and old clients show this; the card replaces it in the channel.
    text: clip(`📬 ${subject} (from ${from})`, TEXT_MAX),
    blocks: [
      {
        type: "container",
        title: { type: "plain_text", text: clip(subject, TITLE_MAX) },
        subtitle: { type: "plain_text", text: clip(`${from} → ${to}`, TITLE_MAX) },
        has_header_divider: true,
        child_blocks: children,
      },
    ],
  };
}

export async function postToSlack(webhookUrl: string, message: SlackMessage, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Slack answers with a short code such as `invalid_blocks`, never with the message itself.
  if (!res.ok) throw new Error(`Slack answered ${res.status} ${(await res.text()).slice(0, 100)}`);
}

export type RelayResult = "posted" | "not-from-list";

/** Throws when Resend or Slack fails, so the webhook answers 5xx and Resend retries. */
export async function relayToSlack(emailId: string, opts: InboundMailOptions): Promise<RelayResult> {
  const email = await fetchReceivedEmail(emailId, opts.resendApiKey, opts.fetch);
  if (!cameThroughList(email, opts.listId)) return "not-from-list";
  await postToSlack(opts.slackWebhookUrl, slackMessage(email), opts.fetch);
  return "posted";
}
