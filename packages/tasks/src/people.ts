// How a person appears in a public response. The one place that decides it, so a private
// profile never leaks a name or a picture, and an email never leaves at all.

import type { PublicPerson } from "@nw/contracts";

/** The contributor columns a public response may use. Never `email`. */
export type PersonRow = { handle: string; displayName: string; avatarUrl: string | null; public: boolean };

/** A private profile shows its handle, unlinked, and nothing else. */
export function contributorPerson(row: PersonRow): PublicPerson {
  return row.public
    ? { kind: "contributor", handle: row.handle, name: row.displayName, avatarUrl: row.avatarUrl, public: true }
    : { kind: "contributor", handle: row.handle, name: null, avatarUrl: null, public: false };
}

/**
 * The author of a post, a proposal or an event: a contributor, a member ("Novawerk"), or someone
 * who deleted their account. Null when the row never had an author (the system).
 */
export function authorOf(
  contributor: PersonRow | null,
  memberName: string | null,
  hadAuthor = true,
): PublicPerson | null {
  if (contributor) return contributorPerson(contributor);
  if (memberName) return { kind: "member", name: memberName };
  return hadAuthor ? { kind: "former" } : null;
}

export const iso = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toISOString();
