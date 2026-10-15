import type { Metadata } from "next";
import Link from "next/link";

import { scenePeople } from "@/components/board/wall";
import { BuildersScene } from "@/components/builders/builders-scene";
import { container, eyebrow, textLink } from "@/components/ui";
import { getBlocks, getContributorPage, getInitiators } from "@/lib/board";

export const metadata: Metadata = {
  title: "Contributors",
  description: "Everyone who merged a task or had an idea accepted on Novawerk's task board, and the people who started our projects. One block at a time.",
  alternates: { canonical: "/contributors" },
};

/**
 * The page is the builders scene: every merged task is a block, carried up by the person who did
 * it. People are reached through the scene's cards (point at a figure or a block), and through the
 * list below it for screen readers and search engines.
 */
export default async function ContributorsPage() {
  const [everyone, blocks, initiators] = await Promise.all([getContributorPage("limit=100"), getBlocks(), getInitiators()]);
  const people = scenePeople(everyone?.contributors ?? [], initiators);

  return (
    <>
      <section className={`${container} pt-12 pb-4 sm:pt-16`}>
        <p className={eyebrow}>Contributors</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">People who built this</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-muted">
          Every merged task is a block on the tower, carried up by the person who did it. Point at a block or a person.
        </p>
      </section>

      <section aria-label="One block at a time" className={`${container} pb-12 sm:pb-16`}>
        <BuildersScene blocks={blocks} people={people} size="hero" />
        <p className="mt-2 text-center text-[13px] text-muted">
          {blocks.length === 0 ? "The ground is ready. " : "There's room for more. "}
          <Link className={textLink} href="/tasks?status=open">
            Pick an open task
          </Link>{" "}
          and add the next block.
        </p>

        {people.length > 0 ? (
          <div className="sr-only">
            <h2>Everyone on the wall</h2>
            <ul>
              {people.map((p) => (
                <li key={p.handle}>
                  <a href={`/u/${p.handle}`}>@{p.handle}</a>
                  {p.name ? `, ${p.name}` : ""}
                  {p.kind === "initiator" && p.project ? `, started ${p.project}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </>
  );
}
