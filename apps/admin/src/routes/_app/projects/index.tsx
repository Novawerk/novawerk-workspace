import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { CalendarIcon, ImageIcon, LayoutGridIcon, MegaphoneIcon, PlusIcon, StarIcon, TriangleAlertIcon } from "lucide-react"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import { cn } from "@nw/ui/lib/utils"

import { Page } from "@/components/page"
import { momentLabel } from "@/components/posts/board"
import { STAGES, type Stage } from "@/components/projects/lifecycle"
import { formatDate, formatRelative } from "@/lib/format"
import { projectBoardQueryOptions } from "@/lib/queries"
import type { BoardPitch, BoardProject } from "@/lib/types"

type Search = { closed?: true }

export const Route = createFileRoute("/_app/projects/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    closed: search.closed === true || search.closed === "true" ? true : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectBoardQueryOptions),
  component: ProjectsPage,
})

type Column = { key: Stage | "closed"; label: string; zh: string; hint: string }

const COLUMNS: Column[] = STAGES.map((s) => ({
  ...s,
  hint: {
    pitch: "From novawerk.io/submit",
    draft: "Not on the website yet",
    planning: "Cutting scope",
    building: "Posts every 2 weeks",
    launching: "Launch date set",
    launched: "T+10, T+30, T+90",
  }[s.key],
}))
const CLOSED: Column = { key: "closed", label: "Closed", zh: "已结束", hint: "Declined pitches, archived projects" }

/**
 * Every project on one board, by stage: a pitch comes in, gets accepted, and moves right as it
 * is planned, built and launched.
 */
function ProjectsPage() {
  const { me } = Route.useRouteContext()
  return me.role === "maintainer" ? <StageBoard /> : <MyProjects />
}

/**
 * What a member without admin access sees: the projects they are on (the API only returns
 * those), newest stage first. Moving a project between stages is an admin's job.
 */
function MyProjects() {
  const { data, isPending } = useQuery(projectBoardQueryOptions)
  const order = (p: BoardProject) => STAGES.findIndex((s) => s.key === p.status)
  const projects = [...(data?.projects ?? [])].sort((a, b) => order(b) - order(a))

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          title="My projects"
          description="The projects you are on. Keep the content, deliverables and files up to date; the website shows changes right away."
        />
      }
    >
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<LayoutGridIcon />}
          title="You're not on a project yet"
          description="Once your pitch is accepted, or someone adds you to a team, the project shows up here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="flex flex-col gap-1.5">
              <StatusBadge kind="project" status={project.status} className="self-start" />
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

/** The admin view: every pitch and project, one column per stage. */
function StageBoard() {
  const { closed } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending } = useQuery(projectBoardQueryOptions)
  const columns = closed ? [...COLUMNS, CLOSED] : COLUMNS

  const pitchesIn = (key: Column["key"]): BoardPitch[] =>
    (data?.pitches ?? []).filter((p) => (key === "pitch" ? p.status === "new" || p.status === "discussing" : key === "closed" && p.status === "declined"))
  const projectsIn = (key: Column["key"]): BoardProject[] =>
    (data?.projects ?? []).filter((p) => (key === "closed" ? p.status === "archived" : p.status === key))
  const closedCount = pitchesIn("closed").length + projectsIn("closed").length

  return (
    <Page
      width="wide"
      className="max-w-none"
      header={
        <PageHeader
          title="Projects"
          description="Every project from the first pitch to launched. Open a card for its pitch, team, deliverables, posts and timeline."
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ search: { closed: closed ? undefined : true } })}
              >
                {closed ? "Hide closed" : `Show closed (${closedCount})`}
              </Button>
              <Button nativeButton={false} render={<Link to="/projects/new" />}>
                <PlusIcon /> New project
              </Button>
            </>
          }
        />
      }
    >
      {isPending ? (
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {COLUMNS.map((c) => (
            <Skeleton key={c.key} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : data && data.pitches.length + data.projects.length === 0 ? (
        <EmptyState
          icon={<LayoutGridIcon />}
          title="No projects yet"
          description="Pitches from novawerk.io/submit land in the first column. You can also add a project by hand."
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1100px] gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((column) => {
              const pitches = pitchesIn(column.key)
              const projects = projectsIn(column.key)
              return (
                <section key={column.key} className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted/40 p-2" aria-label={column.label}>
                  <header className="flex flex-col gap-0.5 px-1 pt-1 pb-1">
                    <span className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                      {column.label}
                      <span className="text-muted-foreground normal-case">{column.zh}</span>
                      <span className="ml-auto rounded-full bg-background px-1.5 text-[11px] text-muted-foreground tabular-nums">
                        {pitches.length + projects.length}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{column.hint}</span>
                  </header>
                  {pitches.map((pitch) => (
                    <PitchCard key={pitch.id} pitch={pitch} />
                  ))}
                  {projects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </Page>
  )
}

const card = "flex flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs transition-colors hover:border-foreground/25"

function PitchCard({ pitch }: { pitch: BoardPitch }) {
  return (
    <Link to="/projects/pitches/$submissionId" params={{ submissionId: pitch.id }} className={card}>
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 font-medium">{pitch.projectName}</span>
        <StatusBadge kind="submission" status={pitch.status} hideDot className="shrink-0" />
      </span>
      <span className="text-xs text-muted-foreground">
        {pitch.name} · {formatRelative(pitch.createdAt)}
      </span>
      {pitch.aiSummary && <span className="line-clamp-3 text-xs text-muted-foreground">{pitch.aiSummary}</span>}
    </Link>
  )
}

function ProjectCard({ project }: { project: BoardProject }) {
  const toReview = project.posts.drafted
  const initiator = project.team.find((t) => t.role.toLowerCase() === "initiator")
  const others = project.team.length - (initiator ? 1 : 0)
  return (
    <Link to="/projects/$projectId" params={{ projectId: project.id }} className={card}>
      <span className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
          {project.coverUrl ? (
            <img src={project.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <ImageIcon className="size-4" />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1 font-medium">
            <span className="line-clamp-2">{project.title}</span>
            {project.featured && <StarIcon aria-label="Featured" className="size-3 shrink-0 fill-warning text-warning" />}
          </span>
          {project.tagline && <span className="truncate text-xs text-muted-foreground">{project.tagline}</span>}
        </span>
      </span>

      {(initiator || others > 0) && (
        <span className="truncate text-xs text-muted-foreground">
          {initiator ? `${initiator.displayName} (Initiator)` : `${others} on the team`}
          {initiator && others > 0 ? ` +${others}` : ""}
        </span>
      )}

      <span className="flex flex-col gap-1 border-t pt-2 text-[11px] text-muted-foreground empty:hidden">
        {project.nextDeliverable && (
          <span className="flex items-center gap-1.5 truncate">
            <CalendarIcon className="size-3 shrink-0" />
            <span className="truncate">
              {project.nextDeliverable.title}
              {project.nextDeliverable.dueOn && ` · ${formatDate(project.nextDeliverable.dueOn)}`}
            </span>
          </span>
        )}
        {project.next && (
          <span className="flex items-center gap-1.5 truncate">
            <MegaphoneIcon className="size-3 shrink-0" />
            <span className="truncate">
              {momentLabel(project.next.kind, project.next.seq)} · {formatDate(project.next.dueOn)}
            </span>
          </span>
        )}
        {toReview > 0 && (
          <span className={cn("flex items-center gap-1.5 font-medium text-warning")}>
            <MegaphoneIcon className="size-3 shrink-0" />
            {toReview === 1 ? "1 post to review" : `${toReview} posts to review`}
          </span>
        )}
        {project.hints.map((hint) => (
          <span key={hint} className="flex items-start gap-1.5 text-warning">
            <TriangleAlertIcon className="mt-px size-3 shrink-0" />
            {hint}
          </span>
        ))}
      </span>
    </Link>
  )
}
