import { TASK_SIZE_WERK, TASK_SIZES } from "@nw/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Avatar, SizeBadge } from "@/components/board/bits";
import { TASK_LIMIT_LINE } from "@/components/board/labels";
import { TaskList } from "@/components/board/task-row";
import { SCENE_MIN_BLOCKS, scenePeople } from "@/components/board/wall";
import { buildModel, summaryLine } from "@/components/builders/model";
import { BuildersScene } from "@/components/builders/builders-scene";
import { NewsletterForm } from "@/components/newsletter-form";
import { buttonAccent, buttonOutline, container, eyebrow, textLink } from "@/components/ui";
import { trackClick } from "@/lib/analytics";
import { getBlocks, getContributorPage, getInitiators, getTaskPage } from "@/lib/board";

import { FromJoinNote, PledgeLine, VisitorSignInLine } from "./contribute-client";

export const metadata: Metadata = {
  title: "Contribute",
  description: "Help build an AI-native community. Pick an open task on the software Novawerk runs on, propose a plan, and ship it.",
  alternates: { canonical: "/contribute" },
};

const STEPS = [
  ["Pick a task", "Every task has a size, an area and a list of what done looks like. Browse without an account."],
  ["Propose a plan", "Say how you'd do it and roughly how long it takes. A member picks one plan and sends you the guide."],
  ["Open a pull request", "Work in the repo and put a Task: NW-42 line in the pull request. We review it on GitHub."],
  ["Merge, earn Werk", "When it merges, the task is done and the Werk goes on your profile."],
] as const;

export default async function ContributePage() {
  const [featured, people, blocks, initiators] = await Promise.all([
    getTaskPage("status=open&limit=3"),
    getContributorPage("limit=100"),
    getBlocks(),
    getInitiators(),
  ]);
  const faces = people?.contributors ?? [];

  return (
    <>
      <Suspense fallback={null}>
        <FromJoinNote />
      </Suspense>

      <section className={`${container} py-16 sm:py-24`}>
        <p className={eyebrow}>Contribute</p>
        <h1 className="mt-5 max-w-[17ch] text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Help build an <em className="whitespace-nowrap text-accent">AI-native</em> community.
        </h1>
        <p className="mt-5 max-w-[60ch] text-lg text-muted">
          Our agents read every pitch, draft our posts and prepare our meetings. The task board is open, and your agent is welcome too.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/tasks" className={buttonAccent} {...trackClick("cta_click", { target: "tasks", placement: "contribute" })}>
            Find a task
          </Link>
          <Link href="/settings/tokens" className={buttonOutline} {...trackClick("cta_click", { target: "agent", placement: "contribute" })}>
            Set up your agent
          </Link>
        </div>
        <VisitorSignInLine />
        <PledgeLine />
      </section>

      <section aria-labelledby="how" className="border-t border-line">
        <div className={`${container} py-14 sm:py-16`}>
          <h2 id="how" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-6 grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([name, text], i) => (
              <li key={name} className="grid content-start gap-2 border-r border-b border-line bg-paper p-[22px]">
                <span className="font-mono text-[13px] text-accent">{i + 1}</span>
                <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
                <p className="text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line">
        <div className={`${container} grid gap-10 py-14 sm:py-16 md:grid-cols-2`}>
          <div className="grid content-start gap-4">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What Werk is</h2>
            <p className="text-muted">
              Werk is how we say thanks. Each task is worth a fixed amount by size: {TASK_SIZES.map((s) => `${s} ${TASK_SIZE_WERK[s]}`).join(", ")}. It
              never turns into money, and there are no levels or ranks.
            </p>
            <div className="flex flex-wrap gap-2">
              {TASK_SIZES.map((s) => (
                <SizeBadge key={s} size={s} />
              ))}
            </div>
          </div>
          <div className="grid content-start gap-4">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What to expect</h2>
            <ul className="grid list-disc gap-2 pl-5 text-muted">
              <li>Signing in makes you a Novawerk member: one account, no ranks. Maintainers run the board.</li>
              <li>We don&apos;t mentor whole projects. Tasks are small enough to finish alone.</li>
              <li>{TASK_LIMIT_LINE} Release a task if life gets busy; nothing counts against you.</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="open-now" className="border-t border-line">
        <div className={`${container} grid gap-5 py-14 sm:py-16`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="open-now" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Open now
            </h2>
            <Link href="/tasks?status=open" className={`${textLink} text-sm`}>
              All open tasks →
            </Link>
          </div>
          {featured && featured.tasks.length > 0 ? (
            <TaskList tasks={featured.tasks} />
          ) : (
            <p className="border border-line bg-paper p-6 text-muted">
              {featured ? "Every task is taken right now. New ones land every week." : "The task board is offline right now. Please try again soon."}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="people" className="border-t border-line">
        <div className={`${container} grid items-center gap-10 py-14 sm:py-16 md:grid-cols-2`}>
          <div className="grid content-start gap-4">
            <h2 id="people" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              People who built this
            </h2>
            <p className="text-muted">Newest faces first. Your face goes here after your first merge.</p>
            {faces.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {faces.slice(0, 9).map((c) => (
                  <li key={c.handle}>
                    <Link href={`/u/${c.handle}`} title={`@${c.handle}`} aria-label={`@${c.handle}`}>
                      <Avatar name={c.name || c.handle} url={c.avatarUrl} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link href="/contributors" className={`${textLink} justify-self-start text-sm`}>
              See everyone →
            </Link>
          </div>
          {blocks.length >= SCENE_MIN_BLOCKS ? (
            <BuildersScene blocks={blocks} people={scenePeople(faces, initiators)} size="compact" />
          ) : blocks.length > 0 ? (
            // A handful of blocks looks like an empty floor: the line says it until the tower grows.
            <p className="text-muted md:text-center">{summaryLine(buildModel(blocks, scenePeople(faces, initiators)))}</p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="agent" className="border-t border-line">
        <div className={`${container} grid items-center gap-6 py-14 sm:py-16 md:grid-cols-2`}>
          <div className="grid gap-3">
            <h2 id="agent" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Work with your coding agent
            </h2>
            <p className="text-muted">
              Everything on the board has an API and an MCP server. Make a token, give it to your agent, and it can read tasks, draft proposals and
              post updates as you. You confirm every proposal it drafts.
            </p>
          </div>
          <div>
            <Link href="/settings/tokens" className={buttonOutline} {...trackClick("cta_click", { target: "agent", placement: "contribute" })}>
              Set up agent access
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="not-ready" className="border-t border-line">
        <div className={`${container} grid items-start gap-6 py-14 sm:py-16 md:grid-cols-2`}>
          <div className="grid gap-3">
            <h2 id="not-ready" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Not ready to start?
            </h2>
            <p className="text-muted">Get the monthly newsletter. It lists new open tasks and thanks the people who shipped.</p>
          </div>
          <NewsletterForm idPrefix="contribute-newsletter" />
        </div>
      </section>
    </>
  );
}
