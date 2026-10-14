// notifyTeam — internal notifications to Novawerk's own inbox. No approval needed because
// it can only ever reach `to`, which callers set to info@novawerk.io. Anything addressed to
// someone outside Novawerk must go through the outbox instead (see ./index.ts).

import { Resend } from "resend";

export interface TeamNotification {
  subject: string;
  text: string;
  html?: string;
  /** Usually the submitter, so the team can reply straight from the inbox. */
  replyTo?: string;
}

export interface NotifyOptions {
  /** If missing, the notification is logged instead of sent (local dev). */
  resendApiKey?: string;
  /** Verified sender, e.g. "Novawerk <info@novawerk.io>". */
  from: string;
  /** Our own inbox. Must be a novawerk.io address. */
  to: string;
}

const TEAM_DOMAIN = "@novawerk.io";

export async function notifyTeam(
  message: TeamNotification,
  opts: NotifyOptions,
): Promise<{ mode: "sent"; id: string } | { mode: "logged" }> {
  if (!opts.to.toLowerCase().endsWith(TEAM_DOMAIN)) {
    throw new Error(`notifyTeam() refused: ${opts.to} is not a Novawerk inbox. Use the outbox.`);
  }
  if (!opts.resendApiKey) {
    console.log("[notifyTeam] RESEND_API_KEY not set — logged instead of sent:", message.subject);
    return { mode: "logged" };
  }
  const resend = new Resend(opts.resendApiKey);
  const { data, error } = await resend.emails.send({
    from: opts.from,
    to: opts.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  });
  if (error) throw new Error(`notifyTeam() failed at Resend: ${error.message}`);
  return { mode: "sent", id: data!.id };
}
