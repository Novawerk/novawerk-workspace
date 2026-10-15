// Sample data for the builders scene (the dev preview and tests). Generated from a fixed seed, so
// it is the same on every run. Handles and names are made up.

import type { Block, BlockArea, BlockSize, Person } from "./types";

export const FIXTURE_PEOPLE: Person[] = [
  { handle: "lena-k", name: "Lena Kovač", avatar: null, kind: "contributor" },
  { handle: "mira", name: "Mira Okafor", avatar: null, kind: "contributor" },
  { handle: "tomasz", name: "Tomasz Wiśniewski", avatar: null, kind: "contributor" },
  { handle: "ana-dev", name: "Ana Ribeiro", avatar: null, kind: "contributor" },
  { handle: "jonas", name: "Jonas Brandt", avatar: null, kind: "contributor" },
  { handle: "priya", name: "Priya Raman", avatar: null, kind: "contributor" },
  { handle: "kofi", name: "Kofi Mensah", avatar: null, kind: "contributor" },
  { handle: "sara-n", name: "Sara Nouri", avatar: null, kind: "initiator", project: "Kiezradar" },
  { handle: "wei", name: "Wei Lin", avatar: null, kind: "initiator", project: "Tidepool" },
];

const NAMED = ["lena-k", "mira", "tomasz", "ana-dev", "jonas", "priya"];

const VERBS = ["Fix", "Add", "Speed up", "Tidy", "Test", "Document", "Simplify"];
const THINGS: Record<BlockArea, string[]> = {
  web: ["the footer links", "focus states on /submit", "the projects grid", "Open Graph images", "the 404 page", "form error messages"],
  admin: ["the outbox table", "the members list", "the pitch view", "date inputs", "the sidebar"],
  api: ["rate limits", "the /public routes", "webhook retries", "input validation"],
  agents: ["the intake summary", "the standup digest", "promo drafts", "agent logs"],
  docs: ["the runbook", "the README", "infra notes", "the posts guide"],
  ci: ["the deploy workflow", "test caching", "the lint step"],
  posts: ["post check", "card rendering"],
  videos: ["caption timing", "the video kit"],
};
const AREA_WEIGHTS: [BlockArea, number][] = [["web", 30], ["admin", 18], ["api", 14], ["agents", 14], ["docs", 10], ["ci", 7], ["posts", 4], ["videos", 3]];
const SIZE_WEIGHTS: [BlockSize, number][] = [["S", 55], ["M", 28], ["L", 13], ["XL", 4]];

const DAY = 86_400_000;

/**
 * `count` merged tasks between `from` and `to` (ISO dates), oldest first. About one in four is by a
 * named contributor; the rest come from people without a public profile (opaque keys).
 */
export function fixtureBlocks(count: number, from = "2026-05-01", to = "2026-10-14", seed = 11): Block[] {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const weighted = <T,>(pairs: [T, number][]) => {
    let x = rnd() * pairs.reduce((n, p) => n + p[1], 0);
    for (const [v, w] of pairs) if ((x -= w) < 0) return v;
    return pairs[0][0];
  };
  const start = Date.parse(`${from}T09:00:00Z`);
  const span = Date.parse(`${to}T09:00:00Z`) - start;
  return Array.from({ length: count }, (_, i) => {
    const area = weighted(AREA_WEIGHTS);
    const at = start + Math.floor((span * i) / Math.max(1, count - 1) / DAY) * DAY + Math.floor(rnd() * 8) * 3_600_000;
    return {
      id: `NW-${100 + i}`,
      title: `${pick(VERBS)} ${pick(THINGS[area])}`,
      area,
      size: weighted(SIZE_WEIGHTS),
      handle: i % 4 === 0 ? pick(NAMED) : `anon-${Math.floor(rnd() * 31).toString(36)}`,
      mergedAt: new Date(at).toISOString(),
    };
  });
}

/** The default sample: 142 tasks since May. */
export const FIXTURE_BLOCKS: Block[] = fixtureBlocks(142);
