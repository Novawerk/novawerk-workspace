// Novawerk Chat signs in with the Novawerk account only (NB-ADR-0014). GET /auth/chat (in
// src/routes/auth.ts) turns the signed-in session into a ticket and sends the browser to the chat,
// which checks it with the same CHAT_SSO_SECRET, finds or creates the person by email, and copies
// the name, picture and role each time.
//
// When an account is deleted, suspended or closed, or its role changes, the API tells the chat at
// once (tellChat): a POST to /sso/novawerk/events with a signed event, so the chat ends their
// sessions or updates their role. "A deleted or suspended account loses the chat too." A
// `profile` event (tellChatProfile) carries the profile after an edit or a Werk change, so the chat
// shows it without signing in again.
//
// The chat shows the Novawerk profile: name, @handle and picture always (they are who you are in
// the chat); Werk and the link to /u/<handle> only for a public profile (NB-ADR-0013: private by
// default). For a private one they are left out of the ticket, not just hidden.
//
// The ticket is an HS256 JWT: issuer `nw-api`, audience `novawerk-chat`, 60 seconds, a random
// `jti` the chat accepts once. It carries only what the chat shows: the account id, the address
// it knows the person by, the name, the picture, the bio and the role. Never a session, never a
// token: the chat can't call the API with it.

import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { eq, sql } from "drizzle-orm";

import { members, werkLedger, type Database, type Member } from "@nw/db";

import type { Logger } from "./types.js";

export const CHAT_TICKET_TTL_SECONDS = 60;
export const CHAT_TICKET_ISSUER = "nw-api";
export const CHAT_TICKET_AUDIENCE = "novawerk-chat";
/** A different audience, so an event is never a ticket and a ticket never an event. */
export const CHAT_EVENT_AUDIENCE = "novawerk-chat-events";

/** Where the chat takes the ticket. */
export const CHAT_SSO_PATH = "/sso/novawerk";
/** Where the chat takes events about accounts. */
export const CHAT_EVENTS_PATH = "/sso/novawerk/events";

/**
 * The address the chat knows someone by: the one they sign in with, else GitHub's verified one
 * (a GitHub-only account). Null: no address yet, so no chat.
 */
export const chatEmail = (account: Pick<Member, "email" | "notifyEmail">): string | null =>
  account.email ?? account.notifyEmail ?? null;

/** Why someone can't go to the chat, or null when they can. */
export function chatRefusal(account: Pick<Member, "active" | "suspendedAt" | "email" | "notifyEmail">): "closed" | "suspended" | "no-email" | null {
  if (!account.active) return "closed";
  if (account.suspendedAt) return "suspended";
  if (!chatEmail(account)) return "no-email";
  return null;
}

/** What the chat shows of the Novawerk profile. Werk and the profile link only when it is public. */
export interface ChatProfile {
  name: string;
  handle: string;
  avatar: string | null;
  bio: string | null;
  role: Member["role"];
  public: boolean;
  /** Total Werk; null for a private profile. */
  werk: number | null;
  /** novawerk.io/u/<handle>; null for a private profile. */
  profile_url: string | null;
}

export async function chatProfile(db: Database, account: Member, webUrl: string): Promise<ChatProfile> {
  let werk: number | null = null;
  if (account.public) {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${werkLedger.delta}), 0)::int` })
      .from(werkLedger)
      .where(eq(werkLedger.contributorId, account.id));
    werk = Number(row?.total ?? 0);
  }
  return {
    name: account.displayName,
    handle: account.handle,
    avatar: account.avatarUrl,
    bio: account.bio,
    role: account.role,
    public: account.public,
    werk,
    profile_url: account.public ? `${webUrl}/u/${account.handle}` : null,
  };
}

export async function signChatTicket(account: Member, profile: ChatProfile, secret: string, now = Date.now()): Promise<string> {
  const email = chatEmail(account);
  if (!email) throw new Error("No address for the chat");
  const seconds = Math.floor(now / 1000);
  return new SignJWT({ email, ...profile })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(account.id)
    .setIssuer(CHAT_TICKET_ISSUER)
    .setAudience(CHAT_TICKET_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + CHAT_TICKET_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/**
 * What the chat does about an account: `deleted` removes the person from the chat (their
 * messages stay), `closed` (suspended, inactive) ends their chat sessions, `role` copies the role.
 */
export type ChatEventKind = "deleted" | "closed" | "role" | "profile";

/**
 * Tell the chat about an account, if the chat is set up. Waits at most 5 seconds and never throws:
 * a chat that is down misses the event, and the API refuses the account's next ticket anyway.
 */
export async function tellChat(
  chat: { url: string; secret: string } | undefined,
  logger: Logger,
  account: Pick<Member, "id" | "email" | "notifyEmail" | "role">,
  kind: ChatEventKind,
  fetchImpl: typeof fetch = fetch,
  profile?: ChatProfile,
): Promise<void> {
  const email = chatEmail(account);
  if (!chat || !email) return;
  try {
    const seconds = Math.floor(Date.now() / 1000);
    const event = await new SignJWT({ kind, email, role: account.role, ...profile })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(account.id)
      .setIssuer(CHAT_TICKET_ISSUER)
      .setAudience(CHAT_EVENT_AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + CHAT_TICKET_TTL_SECONDS)
      .sign(new TextEncoder().encode(chat.secret));
    const res = await fetchImpl(`${chat.url}${CHAT_EVENTS_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${event}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) logger.warn(`[chat] the chat answered ${res.status} to a ${kind} event`);
  } catch (err) {
    logger.warn(`[chat] couldn't tell the chat about a ${kind} event:`, err instanceof Error ? err.message : err);
  }
}

/**
 * The profile changed (an edit, Werk awarded or corrected): the chat shows it at once. Does
 * nothing without the chat, for an account that can't use it, or one that is gone.
 */
export async function tellChatProfile(
  deps: { db: Database; env: { chatSso?: { url: string; secret: string }; publicUrls: { webUrl: string } }; logger: Logger },
  memberId: string,
): Promise<void> {
  if (!deps.env.chatSso) return;
  const [account] = await deps.db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!account || chatRefusal(account)) return;
  const profile = await chatProfile(deps.db, account, deps.env.publicUrls.webUrl);
  await tellChat(deps.env.chatSso, deps.logger, account, "profile", fetch, profile);
}
