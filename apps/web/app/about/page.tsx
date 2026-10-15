import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Avatar } from "@/components/board/bits";
import { NewsletterForm } from "@/components/newsletter-form";
import { Section } from "@/components/section";
import { container, eyebrow, textLink } from "@/components/ui";
import { getContributorPage } from "@/lib/board";
import { getIdentity, getMission, getPrinciples, getProcess } from "@/lib/knowledge";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Who we are, what we believe, and how a Novawerk project moves from idea to something real.",
  alternates: { canonical: "/about" },
};

const pad = (n: number) => String(n).padStart(2, "0");

export default function AboutPage() {
  const identity = getIdentity();
  const mission = getMission();
  const principles = getPrinciples();
  const howWeWork = getProcess();

  return (
    <>
      {/* 1 — Who we are */}
      <section aria-labelledby="who-we-are" className={`${container} py-16 sm:py-24`}>
        <p className={eyebrow}>About</p>
        <h1 id="who-we-are" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Who we are
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-balance sm:text-xl">{identity.description}</p>

        <div className="mt-14 grid gap-6 border-t border-line pt-10 md:grid-cols-[1fr_2fr] md:gap-12">
          <h2 className={eyebrow}>Our mission</h2>
          <div>
            <p className="text-xl font-medium tracking-tight text-balance sm:text-2xl">{mission.lead}</p>
            <ol className="mt-6 border-t border-line">
              {mission.points.map((point, i) => (
                <li key={point} className="flex gap-5 border-b border-line py-3.5">
                  <span className="pt-0.5 font-mono text-sm text-muted">{pad(i + 1)}</span>
                  <span>{point}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 2 — The three principles */}
      <Section id="principles" title="What we believe" intro="Three principles guide every project we take on.">
        <ul className="grid gap-4 md:grid-cols-3 md:gap-6">
          {principles.map((principle) => (
            <li key={principle.number} className="flex flex-col border border-line p-6 sm:p-8">
              <span className="font-mono text-sm text-muted">{principle.number}</span>
              <h3 className="mt-6 text-lg font-medium tracking-tight">{principle.name}</h3>
              <p className="mt-3 text-muted">{principle.summary}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 3 — How a project moves */}
      <Section id="process" title="How a project moves" intro={howWeWork.intro}>
        <ol className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
          {howWeWork.steps.map((step) => (
            <li key={step.number} className="border-r border-b border-line p-6">
              <span className="font-mono text-sm text-accent">{step.number}</span>
              <h3 className="mt-6 text-lg font-medium tracking-tight">{step.name}</h3>
              <p className="mt-3 text-sm text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 4 — Agents and people */}
      <Section id="how-we-run" title="How we run Novawerk">
        <p className="max-w-2xl text-base sm:text-lg">
          We run the day-to-day with AI agents. They draft emails, prepare our meetings and keep our task
          board in order. People make the decisions. Nothing goes out to anyone outside Novawerk until a
          Member has read it and said yes. The one exception is the task board&apos;s own short notices to
          contributors, such as a sign-in code or a decision on their proposal.
        </p>
      </Section>

      {/* 5 — The people who build our tools */}
      <section aria-labelledby="people" className="border-t border-line">
        <div className={`${container} grid items-center gap-6 py-16 sm:py-24 md:grid-cols-2`}>
          <div>
            <h2 id="people" className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              People who built this
            </h2>
            <p className="mt-3 text-base text-muted sm:text-lg">Contributors from everywhere help build the tools we run on.</p>
          </div>
          <div className="grid gap-3">
            <Suspense fallback={null}>
              <Faces />
            </Suspense>
            <Link className={`${textLink} justify-self-start text-sm`} href="/contributors">
              See everyone →
            </Link>
          </div>
        </div>
      </section>

      {/* 6 + 7 — Newsletter and contact */}
      <section aria-labelledby="stay-in-touch" className="border-t border-line">
        <div className={`${container} grid gap-6 py-16 sm:py-24 md:grid-cols-2`}>
          <h2 id="stay-in-touch" className="sr-only">
            Stay in touch
          </h2>
          <div id="newsletter" className="scroll-mt-24 border border-line p-6 sm:p-8">
            <h3 className="text-lg font-medium tracking-tight">Newsletter</h3>
            <p className="mt-2 mb-6 text-sm text-muted">
              What we build, when there&apos;s something to show. Unsubscribe any time.
            </p>
            <NewsletterForm />
          </div>
          <div className="border border-line p-6 sm:p-8">
            <h3 className="text-lg font-medium tracking-tight">Contact and partnerships</h3>
            <p className="mt-2 text-sm text-muted">
              Questions, press, or an idea for working together? Write to us. We read everything.
            </p>
            <p className="mt-6 text-sm">
              <a className={textLink} href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/** Newest faces first, from the contributors wall (cached). */
async function Faces() {
  const page = await getContributorPage("limit=7");
  const faces = page?.contributors ?? [];
  if (faces.length === 0) return <p className="text-sm text-muted">The first faces arrive with the first merged tasks.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {faces.map((c) => (
        <li key={c.handle}>
          <Link href={`/u/${c.handle}`} title={`@${c.handle}`} aria-label={`@${c.handle}`}>
            <Avatar name={c.name || c.handle} url={c.avatarUrl} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
