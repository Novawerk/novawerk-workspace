// The contributors wall and the builders scene from the public reads. Pure.

import type { PublicContributor, PublicInitiator, PublicProjectRef } from "@nw/contracts";

import type { Block, Person } from "../builders/types";

export type ProjectRef = PublicProjectRef;
export type { PublicInitiator };

/** Below this many merged tasks the builders scene looks empty: pages show it smaller or not at all. */
export const SCENE_MIN_BLOCKS = 10;

/** A card on the wall: a contributor, or an initiator (a Member who started a project and opted in). */
export type WallPerson = PublicContributor;

export const isInitiator = (p: WallPerson) => p.kind === "initiator";

/** Public contributors and initiators as the builders scene's people. */
export function scenePeople(contributors: WallPerson[], initiators: PublicInitiator[] = []): Person[] {
  const people: Person[] = contributors
    .filter((c) => !isInitiator(c))
    .map((c) => ({ handle: c.handle, name: c.name, avatar: c.avatarUrl, kind: "contributor" as const }));
  const seen = new Set<string>();
  for (const i of initiators) {
    if (seen.has(i.handle)) continue;
    seen.add(i.handle);
    people.push({ handle: i.handle, name: i.name, avatar: null, kind: "initiator", project: i.project.title });
  }
  return people;
}

export type FirstContribution = { contributor: WallPerson; block: Block };

/**
 * "First contributions": the people whose first merge is the most recent, with that task. Only
 * people on the wall (public, not hidden) appear; `blocks` is oldest first.
 */
export function firstContributions(blocks: Block[], contributors: WallPerson[], n = 6): FirstContribution[] {
  const byHandle = new Map(contributors.filter((c) => !isInitiator(c)).map((c) => [c.handle, c]));
  const first = new Map<string, Block>();
  for (const b of blocks) if (byHandle.has(b.handle) && !first.has(b.handle)) first.set(b.handle, b);
  return [...first.entries()]
    .sort(([, a], [, b]) => (a.mergedAt < b.mergedAt ? 1 : a.mergedAt > b.mergedAt ? -1 : 0))
    .slice(0, n)
    .map(([handle, block]) => ({ contributor: byHandle.get(handle)!, block }));
}
