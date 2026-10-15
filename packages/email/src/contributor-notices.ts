// sendContributorNotice — emails to a contributor about their own account and tasks
// (NB-ADR-0013): chosen or not, replies, the inactivity reminder, a release, a closed task, what
// happened to their suggestion, Werk, a deleted account. They can't wait in the outbox (nobody
// would approve a hundred "you have a reply" mails), so the door is narrow instead:
//
//   - only the kinds in CONTRIBUTOR_NOTICE_KINDS, each a fixed template; what goes in is a task
//     number and title, a number or date, and a member's own note;
//   - the API sends it only to the contributor's own verified address (src/contributor-notices.ts),
//     never to an address someone typed;
//   - every mail says why it came and links to /settings, where replies and reminders turn off.
//
// Everything else sent outside Novawerk still waits in the outbox.

import { Resend } from "resend";

import { CONTRIBUTOR_NOTICE_KINDS, OPTIONAL_CONTRIBUTOR_NOTICES, formatTaskId, type ContributorNoticeKind } from "@nw/contracts";

export interface NoticeTask {
  id: number;
  title: string;
}

export type ContributorNoticeMail =
  | { kind: "proposal_chosen"; task: NoticeTask }
  | { kind: "proposal_not_chosen"; task: NoticeTask; note: string }
  | { kind: "replies"; task: NoticeTask; posts: number; repliesToYou: number }
  | { kind: "reminder"; task: NoticeTask; idleDays: number | null; releaseOn: string | null }
  | { kind: "released"; task: NoticeTask; idle: boolean; note: string | null }
  | { kind: "task_closed"; task: NoticeTask; note: string | null }
  | { kind: "suggestion_accepted"; task: NoticeTask; yours: boolean }
  | { kind: "suggestion_declined"; task: NoticeTask; note: string }
  | { kind: "suggestion_duplicate"; task: NoticeTask; duplicateOf: NoticeTask | null }
  | { kind: "suggestion_needs_info"; task: NoticeTask; note: string | null }
  | { kind: "werk_awarded"; task: NoticeTask; werk: number }
  | { kind: "account_deleted"; handle: string };

export interface ContributorNoticeOptions {
  /** If missing, the mail is logged instead of sent (local development only). */
  resendApiKey?: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
  /** The website's origin, e.g. https://novawerk.io: every link points there. */
  webUrl: string;
  /** Resend deduplicates a retry with the same key: a notice is never sent twice. */
  idempotencyKey?: string;
  /**
   * For the kinds people can turn off (replies, reminders): a URL that turns them off with one
   * POST (RFC 8058). Sent as List-Unsubscribe and List-Unsubscribe-Post.
   */
  unsubscribeUrl?: string;
}

/** Resend refused or failed; `code` is Resend's error name, e.g. `rate_limit_exceeded`. */
export class ContributorNoticeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContributorNoticeError";
  }
}

type Block = { p: string } | { quote: string } | { button: { href: string; label: string } };

const SINGLE_ADDRESS = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE = 2000;
const MAX_TITLE = 200;

function origin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`Not a web address: ${url}`);
  return parsed.origin;
}

/** One line, at most `max` characters: nothing in a title or note can add headers or layout. */
const clean = (value: string, max: number) => {
  const flat = value.replace(/\r\n?/g, "\n").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const label = (task: NoticeTask) => `${formatTaskId(task.id)}: ${clean(task.title, MAX_TITLE).replace(/\s+/g, " ")}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** 2026-10-19 → "Oct 19". */
const day = (iso: string) => {
  if (!DATE.test(iso)) throw new Error(`Not a date: ${iso}`);
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

/** Subject and body blocks for one notice. Exported for tests and previews. */
export function contributorNoticeContent(mail: ContributorNoticeMail, webUrl: string): { subject: string; blocks: Block[] } {
  const web = origin(webUrl);
  if (mail.kind === "account_deleted") {
    return {
      subject: "Your Novawerk contributor account is deleted",
      blocks: [
        { p: `We deleted the contributor account @${clean(mail.handle, 40)}: your profile, proposals and tokens.` },
        { p: "Merged work stays in git history. On the task board it shows as \"a former contributor\"." },
        { p: "This is the last email we send you about the task board. If you didn't ask for this, reply and tell us." },
      ],
    };
  }
  const task = mail.task;
  const id = formatTaskId(task.id);
  const taskUrl = `${web}/tasks/${id}`;
  const open = (text = "Open the task") => ({ button: { href: taskUrl, label: text } });
  switch (mail.kind) {
    case "proposal_chosen":
      return {
        subject: `${id} is yours`,
        blocks: [
          { p: `We picked your plan for ${label(task)}. The task is yours now.` },
          { p: `Your contribution guide is on the task page: how to get the code, our rules, and how to open the PR with "Closes ${id}".` },
          { button: { href: `${taskUrl}#guide`, label: "Open the guide" } },
          { p: "Can't finish it? Release the task on that page. Nothing counts against you." },
        ],
      };
    case "proposal_not_chosen":
      return {
        subject: `About your plan for ${id}`,
        blocks: [
          { p: `Thanks for your plan for ${label(task)}. We picked another one this time.` },
          { p: "A note from us, only for you:" },
          { quote: clean(mail.note, MAX_NOTE) },
          { button: { href: `${web}/tasks`, label: "Find another task" } },
        ],
      };
    case "replies": {
      const toYou = mail.repliesToYou > 0 ? `, ${mail.repliesToYou === mail.posts ? (mail.posts === 1 ? "a reply" : "all replies") : plural(mail.repliesToYou, "reply", "replies")} to you` : "";
      return {
        subject: `New ${mail.posts === 1 ? "reply" : "replies"} on ${id}`,
        blocks: [{ p: `${plural(mail.posts, "new post", "new posts")} on ${label(task)}${toYou}.` }, open("Read the thread")],
      };
    }
    case "reminder":
      return {
        subject: `${id}: still on it?`,
        blocks: [
          { p: `We haven't seen activity on ${label(task)}${mail.idleDays ? ` for ${mail.idleDays} days` : " for a while"}.` },
          {
            p: `Post an update, or ask for a week more, on the task page. If nothing happens, the task goes back on the board${mail.releaseOn ? ` on ${day(mail.releaseOn)}` : " soon"}.`,
          },
          open("Post an update"),
        ],
      };
    case "released":
      return {
        subject: `${id} is back on the board`,
        blocks: [
          mail.idle
            ? { p: `${label(task)} had no activity for a while, so it went back on the board.` }
            : { p: `A member released ${label(task)}. It is back on the board.` },
          ...(mail.note && !mail.idle ? [{ quote: clean(mail.note, MAX_NOTE) }] : []),
          { p: "Nothing counts against you. You can propose again any time." },
          open(),
        ],
      };
    case "task_closed":
      return {
        subject: `${id} is closed`,
        blocks: [
          { p: `A member closed ${label(task)}, which you were working on.` },
          ...(mail.note ? [{ quote: clean(mail.note, MAX_NOTE) }] : []),
          { p: "Nothing counts against you. Thanks for the work you put in." },
          { button: { href: `${web}/tasks`, label: "Find another task" } },
        ],
      };
    case "suggestion_accepted":
      return {
        subject: `Your idea is on the board: ${id}`,
        blocks: mail.yours
          ? [
              { p: `We accepted your suggestion ${label(task)}, and it's yours to build.` },
              { p: "Your contribution guide is on the task page." },
              { button: { href: `${taskUrl}#guide`, label: "Open the guide" } },
            ]
          : [{ p: `We accepted your suggestion ${label(task)}. It is open for anyone to pick up now. Thanks for the idea.` }, open()],
      };
    case "suggestion_declined":
      return {
        subject: `About your suggestion ${id}`,
        blocks: [
          { p: `We read your suggestion ${label(task)} and won't take it on.` },
          { quote: clean(mail.note, MAX_NOTE) },
          { p: "Thanks for writing it up. Every suggestion gets read." },
          open(),
        ],
      };
    case "suggestion_duplicate":
      return {
        subject: `Your suggestion ${id} is already on the board`,
        blocks: [
          mail.duplicateOf
            ? { p: `We already track ${label(task)} as ${label(mail.duplicateOf)}. Follow it there.` }
            : { p: `We already track ${label(task)} in another task.` },
          mail.duplicateOf
            ? { button: { href: `${web}/tasks/${formatTaskId(mail.duplicateOf.id)}`, label: `Open ${formatTaskId(mail.duplicateOf.id)}` } }
            : open(),
        ],
      };
    case "suggestion_needs_info":
      return {
        subject: `A question about your suggestion ${id}`,
        blocks: [
          { p: `We have a question about ${label(task)}.` },
          ...(mail.note ? [{ quote: clean(mail.note, MAX_NOTE) }] : []),
          { p: "Answer in the thread, so everyone sees it." },
          open("Answer in the thread"),
        ],
      };
    case "werk_awarded":
      return {
        subject: `+${mail.werk} Werk for ${id}`,
        blocks: [
          { p: `Your pull request for ${label(task)} is merged. You earned ${mail.werk} Werk.` },
          { p: "Thank you. It's in the product now." },
          open(),
        ],
      };
  }
}

/** Why this mail came, and where to change it. */
function footer(kind: ContributorNoticeKind, web: string): { text: string; settings: string | null } {
  if (kind === "account_deleted") {
    return { text: "You get this email because your contributor account on novawerk.io was deleted.", settings: null };
  }
  const optional = kind in OPTIONAL_CONTRIBUTOR_NOTICES;
  return {
    text: optional
      ? "You get this email because you have a contributor account on novawerk.io and it is about your own posts or tasks. You can turn these emails off in Settings."
      : "You get this email because you have a contributor account on novawerk.io and it is about your own tasks. We always send this one.",
    settings: `${web}/settings`,
  };
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The whole email: subject, plain text, and light HTML (600 px, inline styles). */
export function contributorNoticeEmail(mail: ContributorNoticeMail, webUrl: string): { subject: string; text: string; html: string } {
  const web = origin(webUrl);
  const { subject, blocks } = contributorNoticeContent(mail, web);
  const foot = footer(mail.kind, web);

  const text = [
    ...blocks.map((b) =>
      "p" in b ? b.p : "quote" in b ? b.quote.split("\n").map((l) => `> ${l}`).join("\n") : `${b.button.label}: ${b.button.href}`,
    ),
    "--",
    foot.text,
    ...(foot.settings ? [`Settings: ${foot.settings}`] : []),
    "Novawerk · https://novawerk.io",
  ].join("\n\n");

  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const body = blocks
    .map((b) => {
      if ("p" in b) return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#18181b;">${escape(b.p)}</p>`;
      if ("quote" in b) {
        return `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #d4d4d8;background:#f4f4f5;font-size:15px;line-height:22px;color:#27272a;white-space:pre-line;">${escape(b.quote)}</p>`;
      }
      return `<p style="margin:8px 0 24px;"><a href="${escape(b.button.href)}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#ffffff;font-size:15px;text-decoration:none;">${escape(b.button.label)}</a></p>`;
    })
    .join("");
  const settingsLink = foot.settings
    ? ` <a href="${escape(foot.settings)}" style="color:#52525b;">Settings</a>`
    : "";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${escape(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#ffffff;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;${font};">` +
    `<tr><td style="padding:0 0 24px;font-size:14px;font-weight:600;color:#18181b;">✦ Novawerk</td></tr>` +
    `<tr><td>${body}</td></tr>` +
    `<tr><td style="padding:24px 0 0;border-top:1px solid #e4e4e7;font-size:13px;line-height:20px;color:#71717a;">${escape(foot.text)}${settingsLink}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export async function sendContributorNotice(
  to: string,
  mail: ContributorNoticeMail,
  opts: ContributorNoticeOptions,
): Promise<{ mode: "sent"; id: string } | { mode: "logged" }> {
  if (!SINGLE_ADDRESS.test(to.trim())) throw new Error(`sendContributorNotice(): "${to}" is not a single email address.`);
  if (!(CONTRIBUTOR_NOTICE_KINDS as readonly string[]).includes(mail.kind)) {
    throw new Error(`sendContributorNotice(): "${String(mail.kind)}" is not a contributor notice.`);
  }
  const email = contributorNoticeEmail(mail, opts.webUrl);
  const optional = mail.kind in OPTIONAL_CONTRIBUTOR_NOTICES;
  if (opts.unsubscribeUrl && (!optional || !/^https?:\/\/[^\s<>]+$/.test(opts.unsubscribeUrl))) {
    throw new Error("sendContributorNotice(): an unsubscribe URL only goes on replies and reminders.");
  }
  if (!opts.resendApiKey) {
    console.log(`[sendContributorNotice] RESEND_API_KEY not set — ${mail.kind} for ${to}: ${email.subject}`);
    return { mode: "logged" };
  }
  const { data, error } = await new Resend(opts.resendApiKey).emails.send(
    {
      from: opts.from,
      to: to.trim(),
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(opts.unsubscribeUrl
        ? { headers: { "List-Unsubscribe": `<${opts.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
  if (error) throw new ContributorNoticeError(error.name, `sendContributorNotice() failed at Resend: ${error.message}`);
  return { mode: "sent", id: data!.id };
}
