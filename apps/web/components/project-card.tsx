import Image from "next/image";
import type { PublicProject } from "@nw/contracts";

import { trackClick } from "@/lib/analytics";
import { STATUS_LABELS } from "@/lib/projects";

import { NovaStar } from "./nova-star";

const STATUS_DOT: Record<PublicProject["status"], string> = {
  planning: "border border-muted",
  building: "bg-muted",
  launching: "border border-accent",
  launched: "bg-accent",
};

export function ProjectCard({ project }: { project: PublicProject }) {
  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-subtle">
        {project.coverUrl ? (
          <Image
            src={project.coverUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <NovaStar tone="neutral" className="size-14" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="flex items-start justify-between gap-4 text-lg font-medium tracking-tight">
          <span>{project.title}</span>
          {project.link ? (
            <span aria-hidden="true" className="text-muted transition-colors group-hover:text-ink">
              ↗
            </span>
          ) : null}
        </h3>
        {project.tagline ? <p className="mt-2 text-sm text-muted">{project.tagline}</p> : null}
        <p className="mt-auto flex items-center gap-2 pt-6 font-mono text-xs text-muted">
          <span aria-hidden="true" className={`inline-block size-2 ${STATUS_DOT[project.status]}`} />
          <span>{STATUS_LABELS[project.status]}</span>
          {project.year ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{project.year}</span>
            </>
          ) : null}
        </p>
      </div>
    </>
  );

  const frame = "flex h-full flex-col border border-line bg-paper";

  if (!project.link) return <div className={frame}>{body}</div>;

  return (
    <a
      href={project.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`${frame} group transition-colors duration-150 hover:border-ink`}
      {...trackClick("project_click", { project: project.slug })}
    >
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
