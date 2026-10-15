import type { Metadata } from "next";
import Link from "next/link";

import { Avatar } from "@/components/board/bits";
import { formatDate } from "@/components/board/labels";
import { firstContributions, SCENE_MIN_BLOCKS, scenePeople } from "@/components/board/wall";
import { BuildersScene } from "@/components/builders/builders-scene";
import { container, eyebrow } from "@/components/ui";
import { getBlocks, getContributorPage, getInitiators } from "@/lib/board";

import { ContributorWall } from "./contributor-wall";

export const metadata: Metadata = {
  title: "Contributors",
  description: "Everyone who merged a task or had an idea accepted on Novawerk's task board. Newest faces first.",
  alternates: { canonical: "/contributors" },
};

export default async function ContributorsPage() {
  const [page, everyone, blocks, initiators] = await Promise.all([
    getContributorPage(),
    getContributorPage("limit=100"),
    getBlocks(),
    getInitiators(),
  ]);
  const firsts = firstContributions(blocks, everyone?.contributors ?? []);

  return (
    <>
      <section className={`${container} pt-16 pb-7 sm:pt-20`}>
        <p className={eyebrow}>Contributors</p>
        <h1 className="mt-3.5 text-4xl font-semibold tracking-tight sm:text-5xl">People who built this</h1>
        <p className="mt-3.5 max-w-[60ch] text-lg text-muted">
          Everyone who merged a task or had an idea accepted, and the people who started our projects. Newest faces first.
        </p>
      </section>

      {firsts.length > 0 ? (
        <section aria-labelledby="firsts" className={`${container} grid gap-3 pb-7`}>
          <h2 id="firsts" className="text-[15px] font-semibold">
            First contributions
          </h2>
          <ul className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1.5">
            {firsts.map(({ contributor: c, block }) => (
              <li key={c.handle} className="relative grid gap-2 border border-line bg-paper p-5 hover:border-ink">
                <span className="flex items-center gap-2.5">
                  <Avatar name={c.name || c.handle} url={c.avatarUrl} />
                  <span>
                    <Link href={`/u/${c.handle}`} className="font-medium after:absolute after:inset-0">
                      @{c.handle}
                    </Link>
                    <br />
                    <span className="text-[13px] text-muted">first merge · {formatDate(block.mergedAt)}</span>
                  </span>
                </span>
                <span className="text-sm">
                  <span className="font-mono text-muted">{block.id}</span> {block.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ContributorWall initial={page} />

      <section aria-labelledby="blocks" className="border-t border-line">
        <div className={`${container} grid justify-items-center gap-4 py-16 text-center sm:py-20`}>
          <h2 id="blocks" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One block at a time
          </h2>
          <BuildersScene blocks={blocks} people={scenePeople(everyone?.contributors ?? [], initiators)} size={blocks.length >= SCENE_MIN_BLOCKS ? "full" : "compact"} />
          <p className="text-[13px] text-muted">Point at a block or a person.</p>
        </div>
      </section>
    </>
  );
}
