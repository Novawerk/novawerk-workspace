import type { CtaTarget } from "@nw/contracts";
import Link from "next/link";
import { Suspense } from "react";

import { ProjectCard } from "@/components/project-card";
import { Section } from "@/components/section";
import { buttonAccent, buttonOutline, container, eyebrow } from "@/components/ui";
import { trackClick } from "@/lib/analytics";
import { getIdentity } from "@/lib/knowledge";
import { getProjects } from "@/lib/projects";

export default function HomePage() {
  const { headline, tagline } = getIdentity();

  return (
    <>
      <section className={`${container} py-16 sm:py-24 lg:py-28`}>
        <p className={eyebrow}>{tagline}</p>
        <h1 className="mt-5 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {headline}
        </h1>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/submit" className={buttonAccent} {...trackClick("cta_click", { target: "submit", placement: "hero" })}>
            Pitch a project
          </Link>
          <Link href="/contribute" className={buttonOutline} {...trackClick("cta_click", { target: "contribute", placement: "hero" })}>
            Contribute
          </Link>
        </div>
      </section>

      <Section
        id="projects"
        title="Projects"
        intro="What we're building right now. Every project here is still being improved."
      >
        <Suspense fallback={<ProjectsSkeleton />}>
          <ProjectsGrid />
        </Suspense>
      </Section>

      <Section id="get-involved" title="Get involved">
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <li>
            <EntryCard
              target="submit"
              title="Pitch a project"
              body="Have an idea that should exist? Tell us what it is, who it helps and how you'd build it. We usually reply within a few days."
              cta="Pitch a project"
            />
          </li>
          <li>
            <EntryCard
              target="tasks"
              title="Contribute to our tools"
              body="Pick an open task on the software we run on: this site, the admin panel, the agents. Your name goes on what you ship."
              cta="See open tasks"
            />
          </li>
        </ul>
      </Section>
    </>
  );
}

function EntryCard({ target, href = `/${target}`, title, body, cta }: { target: CtaTarget; href?: string; title: string; body: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col border border-line p-6 transition-colors duration-150 hover:border-ink sm:p-8"
      {...trackClick("cta_click", { target, placement: "get-involved" })}
    >
      <h3 className="text-xl font-medium tracking-tight">{title}</h3>
      <p className="mt-3 text-muted">{body}</p>
      <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-ink">
        {cta}
        <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

/** The portfolio. Cached ("use cache" in getProjects), so it is part of the prerendered page. */
async function ProjectsGrid() {
  const projects = await getProjects();
  if (projects.length === 0) {
    return <p className="border border-line p-6 text-muted">No projects to show yet. Check back soon.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.slug}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}

function ProjectsSkeleton() {
  return (
    <ul aria-hidden="true" className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {[0, 1].map((i) => (
        <li key={i} className="border border-line">
          <div className="aspect-[4/3] bg-subtle" />
          <div className="space-y-3 p-6">
            <div className="h-5 w-1/2 bg-subtle" />
            <div className="h-4 w-4/5 bg-subtle" />
          </div>
        </li>
      ))}
    </ul>
  );
}
