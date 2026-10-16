// sendWelcome — one email when someone makes a Novawerk account (NB-ADR-0014): a greeting by
// name, what being a member means, and a link to the contribution guide. Like the notices it
// skips the outbox, so the door is narrow:
//
//   - a fixed template; the only thing anyone typed in it is their own name, escaped and flattened
//     to one line;
//   - the API sends it once per account (members.welcome_sent_at, claimed before sending) and only
//     to the address the person just proved is theirs (src/welcome.ts in apps/api);
//   - agents never send it: they never get the Resend key.

import { Resend } from "resend";

import { SINGLE_ADDRESS, origin, renderFixedEmail, type Block } from "./contributor-notices.js";

export interface WelcomeOptions {
  /** If missing, the mail is logged instead of sent (local development only). */
  resendApiKey?: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
  /** The website's origin, e.g. https://novawerk.io: every link points there. */
  webUrl: string;
  /** Resend deduplicates a retry with the same key. */
  idempotencyKey?: string;
}

const MAX_NAME = 100;

/** The name as it goes in: one line, no control characters, at most 100 characters. */
const greetingName = (name: string) => {
  const flat = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > MAX_NAME ? `${flat.slice(0, MAX_NAME - 1)}…` : flat;
};

export function welcomeEmail(name: string, webUrl: string): { subject: string; text: string; html: string } {
  const web = origin(webUrl);
  const who = greetingName(name);
  const blocks: Block[] = [
    { p: who ? `Hi ${who},` : "Hi," },
    { p: "Welcome to Novawerk. You have a Novawerk account now: you are a member. There are no ranks among members." },
    {
      p:
        "With this account you can pick a task on our task board, propose how you'd do it, discuss tasks and suggest " +
        "improvements. The same account opens our team chat, and the admin panel once you are on a project's team.",
    },
    {
      p:
        "Maintainers run Novawerk: they choose a plan for each task, review pull requests and keep the board tidy. " +
        "Merged work earns Werk, which shows on your profile. It is recognition, never money.",
    },
    { p: "The contribution guide says how the board works, how to propose, why we ask you to link GitHub, and how to sign off your commits." },
    { button: { href: `${web}/contribute/guide`, label: "Read the guide" } },
    { p: "你好！欢迎加入 Novawerk。你现在是一名成员。上面的指南介绍任务板如何运作、如何提交方案、关联 GitHub 和 DCO 签名。" },
  ];
  return renderFixedEmail("Welcome to Novawerk", blocks, {
    text: "You get this email once, because you just made a Novawerk account on novawerk.io.",
    settings: `${web}/settings`,
  });
}

export async function sendWelcome(
  to: string,
  name: string,
  opts: WelcomeOptions,
): Promise<{ mode: "sent"; id: string } | { mode: "logged" }> {
  if (!SINGLE_ADDRESS.test(to.trim())) throw new Error(`sendWelcome(): "${to}" is not a single email address.`);
  const email = welcomeEmail(name, opts.webUrl);
  if (!opts.resendApiKey) {
    console.log(`[sendWelcome] RESEND_API_KEY not set — welcome email for ${to}`);
    return { mode: "logged" };
  }
  const { data, error } = await new Resend(opts.resendApiKey).emails.send(
    { from: opts.from, to: to.trim(), subject: email.subject, text: email.text, html: email.html },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
  if (error) throw new Error(`sendWelcome() failed at Resend: ${error.message}`);
  return { mode: "sent", id: data!.id };
}
