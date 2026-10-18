// Words and small pure helpers for the task board. No clock: dates print from the ISO string in
// UTC, so the server and the browser always agree.

import {
  TASK_SIZE_WERK,
  type ProposalEta,
  type PublicPerson,
  type PublicTask,
  type SuggestionWhere,
  type TaskSize,
} from "@nw/contracts";

/** What the board shows: "proposed" is open with pending proposals; declined and duplicate read as closed. */
export type BoardState = "suggested" | "open" | "proposed" | "assigned" | "in_review" | "done" | "closed";

export function boardState(task: Pick<PublicTask, "status" | "proposalCount">): BoardState {
  switch (task.status) {
    case "open":
      return task.proposalCount > 0 ? "proposed" : "open";
    case "declined":
    case "duplicate":
      return "closed";
    default:
      return task.status;
  }
}

export const STATE_DOT: Record<BoardState, string> = {
  suggested: "border border-dashed border-st-suggested",
  open: "bg-st-open",
  proposed: "bg-st-proposed",
  assigned: "bg-st-progress",
  in_review: "bg-st-review",
  done: "bg-st-done",
  closed: "bg-st-closed",
};

export const STATE_COLUMN: Record<Exclude<BoardState, "closed">, string> = {
  suggested: "Suggested",
  open: "Open",
  proposed: "Proposals",
  assigned: "In progress",
  in_review: "In review",
  done: "Done",
};

export const ETA_LABELS: Record<ProposalEta, string> = {
  days: "A few days",
  week: "About a week",
  two_weeks: "Two weeks",
};

export const WHERE_LABELS: Record<SuggestionWhere, string> = {
  site: "Public site",
  admin: "Admin panel",
  api: "API",
  agents: "Agents",
  posts: "Posts tooling",
  videos: "Videos",
  unsure: "Not sure",
};

export const werkOf = (size: TaskSize) => TASK_SIZE_WERK[size];


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Oct 11, 2026" (UTC). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "August 2026" (UTC). */
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "@lena-k", "Novawerk" or "a former contributor". */
export function personLabel(person: PublicPerson | null): string {
  if (!person) return "someone";
  if (person.kind === "contributor") return `@${person.handle}`;
  if (person.kind === "member") return person.name;
  return "a former contributor";
}

/** "#231" from a GitHub pull request URL, or the URL. */
export function prLabel(url: string): string {
  const match = /\/pull\/(\d+)/.exec(url);
  return match ? `PR #${match[1]}` : "the pull request";
}

/** A link a contributor wrote may only go to http(s). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "lena@posteo.at" → "l•••@posteo.at". Only the owner ever sees even this. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 1)}•••@${domain}` : "•••";
}

/** Links people write: http(s) and mailto, or a path on this site ("/tasks", never "//host"). */
export function safeMarkdownHref(href: string | undefined): { href: string; external: boolean } | null {
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
  if (/^\/(?![/\\])/.test(href)) return { href, external: false };
  return null;
}

/** For links a contributor wrote: no referrer, no ranking credit (opens in a new tab). */
export const UGC_REL = "noopener noreferrer nofollow ugc";
