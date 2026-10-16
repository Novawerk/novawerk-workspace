// Novawerk Chat signs in with the Novawerk account only (NB-ADR-0014). GET /auth/chat (in
// src/routes/auth.ts) turns the signed-in session into a ticket and sends the browser to the chat,
// which checks it with the same CHAT_SSO_SECRET, finds or creates the person by email, and copies
// the name, picture and role each time.
//
// The ticket is an HS256 JWT: issuer `nw-api`, audience `novawerk-chat`, 60 seconds, a random
// `jti` the chat accepts once. It carries only what the chat shows: the account id, the address
// it knows the person by, the name, the picture, the bio and the role. Never a session, never a
// token: the chat can't call the API with it.

import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import type { Member } from "@nw/db";

export const CHAT_TICKET_TTL_SECONDS = 60;
export const CHAT_TICKET_ISSUER = "nw-api";
export const CHAT_TICKET_AUDIENCE = "novawerk-chat";

/** Where the chat takes the ticket. */
export const CHAT_SSO_PATH = "/sso/novawerk";

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

export async function signChatTicket(account: Member, secret: string, now = Date.now()): Promise<string> {
  const email = chatEmail(account);
  if (!email) throw new Error("No address for the chat");
  const seconds = Math.floor(now / 1000);
  return new SignJWT({
    email,
    name: account.displayName,
    handle: account.handle,
    avatar: account.avatarUrl,
    bio: account.bio,
    role: account.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(account.id)
    .setIssuer(CHAT_TICKET_ISSUER)
    .setAudience(CHAT_TICKET_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + CHAT_TICKET_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}
