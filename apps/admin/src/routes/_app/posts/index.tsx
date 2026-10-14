import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, FolderGit2Icon, MegaphoneIcon, PlusIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { POST_KINDS, POST_KIND_INFO, type PostKind } from "@nw/contracts"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Input } from "@nw/ui/core/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@nw/ui/core/components/ui/select"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import { cn } from "@nw/ui/lib/utils"

import { Page } from "@/components/page"
import { AddPostButton, NewPostDialog } from "@/components/posts/add-post"
import { COLUMNS, ColumnHeads, Columns, momentLabel } from "@/components/posts/board"
import { ownerName, postTitle } from "@/components/posts/post-meta"
import { formatDate } from "@/lib/format"
import { postBoardQueryOptions } from "@/lib/queries"
import type { Post, PostLane } from "@/lib/types"

type Source = "repo" | "here"
type Search = { project?: string; kind?: PostKind; source?: Source; q?: string; skipped?: true }

/** The project filter's value for posts about Novawerk itself. */
const NOVAWERK = "novawerk"
const ALL = "all"

export const Route = createFileRoute("/_app/posts/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    project: typeof search.project === "string" && search.project ? search.project : undefined,
    kind: typeof search.kind === "string" && (POST_KINDS as readonly string[]).includes(search.kind) ? (search.kind as PostKind) : undefined,
    source: search.source === "repo" || search.source === "here" ? search.source : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    skipped: search.skipped === true || search.skipped === "true" ? true : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postBoardQueryOptions),
  component: PostsPage,
})

const matches = (post: Post, q: string) =>
  [postTitle(post), post.label, ownerName(post), momentLabel(post.kind, post.seq, post.label), post.content?.en.title, post.sourcePath]
    .filter(Boolean)
    .some((text) => text!.toLowerCase().includes(q))

/** Every post by the step it is at: planned, to review, approved, posted. Narrow it down with the filters. */
function PostsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isPending } = useQuery(postBoardQueryOptions)
  const [creating, setCreating] = React.useState(false)
  const [query, setQuery] = React.useState(search.q ?? "")
  const set = (patch: Partial<Search>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  // The search box writes to the URL a moment after typing stops.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.q ?? "") !== query.trim()) set({ q: query.trim() || undefined })
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const lanes = data?.lanes ?? []
  const general = data?.general ?? []
  const lane = search.project && search.project !== NOVAWERK ? lanes.find((l) => l.project.id === search.project) : undefined
  const scope =
    search.project === NOVAWERK ? general : lane ? lane.posts : [...lanes.flatMap((l) => l.posts), ...general]
  const q = search.q?.toLowerCase()
  const posts = scope.filter(
    (p) =>
      (!search.kind || p.kind === search.kind) &&
      (!search.source || (search.source === "repo") === Boolean(p.sourcePath)) &&
      (!q || matches(p, q)),
  )
  const columns = search.skipped ? [...COLUMNS, "skipped" as const] : COLUMNS
  const skippedCount = posts.filter((p) => p.status === "skipped").length
  const filtered = Boolean(search.kind || search.source || search.q || search.project)

  const projectOptions = [
    { value: ALL, label: "All projects" },
    ...(general.length || data ? [{ value: NOVAWERK, label: "Novawerk itself" }] : []),
    ...lanes.map((l) => ({ value: l.project.id, label: l.project.title })),
  ]
  const kindOptions = [{ value: ALL, label: "Every kind" }, ...POST_KINDS.map((k) => ({ value: k, label: `${POST_KIND_INFO[k].zh} · ${POST_KIND_INFO[k].label}` }))]

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          title="Posts"
          description="Everything we post, on its way out. Open a card to edit, approve and mark it posted."
          actions={
            <>
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> New post
              </Button>
              {creating && <NewPostDialog onClose={() => setCreating(false)} />}
            </>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts" aria-label="Search posts" className="pl-8" />
        </div>
        <Select
          items={projectOptions}
          value={search.project ?? ALL}
          onValueChange={(v) => set({ project: !v || v === ALL ? undefined : String(v) })}
        >
          <SelectTrigger aria-label="Project" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projectOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={kindOptions} value={search.kind ?? ALL} onValueChange={(v) => set({ kind: !v || v === ALL ? undefined : (v as PostKind) })}>
          <SelectTrigger aria-label="Kind" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kindOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div role="group" aria-label="Where it was written" className="flex h-8 items-center rounded-lg border p-0.5 text-xs">
          {([undefined, "here", "repo"] as const).map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={search.source === s}
              onClick={() => set({ source: s })}
              className={cn(
                "flex h-full items-center gap-1 rounded-md px-2.5 text-muted-foreground transition-colors",
                search.source === s && "bg-muted font-medium text-foreground",
              )}
            >
              {s === "repo" && <FolderGit2Icon className="size-3.5" />}
              {s === undefined ? "All" : s === "here" ? "Written here" : "From the repo"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => set({ skipped: search.skipped ? undefined : true })}>
          {search.skipped ? "Hide skipped" : `Show skipped${skippedCount ? ` (${skippedCount})` : ""}`}
        </Button>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setQuery("")
              void navigate({ search: (prev) => ({ skipped: prev.skipped }), replace: true })
            }}
          >
            <XIcon /> Clear
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      ) : lanes.length === 0 && general.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon />}
          title="No posts yet"
          description="A project's posts appear once it starts building. Add any other post with New post, or write one in the repo."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {lane && <ProjectLine lane={lane} />}
          {search.project === NOVAWERK && (
            <p className="text-xs text-muted-foreground">Posts about Novawerk itself: open days, calls for builders, thank-yous, round-ups.</p>
          )}
          <ColumnHeads posts={posts} columns={columns} className="sticky -top-4 z-10 bg-background pt-1 pb-1 sm:-top-6" />
          <Columns posts={posts} columns={columns} today={data!.today} showProject={!lane} />
        </div>
      )}
    </Page>
  )
}

/** With one project picked: its stage, what comes up next, what it still needs. */
function ProjectLine({ lane }: { lane: PostLane }) {
  const { project } = lane
  const next = [...lane.upcoming].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
      <StatusBadge kind="project" status={project.status} />
      {project.launchDate && <span>Launch {formatDate(project.launchDate)}</span>}
      {next && (
        <span>
          Next: {momentLabel(next.kind, next.seq)}, {formatDate(next.dueOn)}
        </span>
      )}
      {lane.hints.map((hint) => (
        <span key={hint} className="flex items-center gap-1 text-warning">
          <TriangleAlertIcon className="size-3" /> {hint}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1">
        <AddPostButton projectId={project.id} variant="ghost" size="sm" />
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/projects/$projectId" params={{ projectId: project.id }} search={{ tab: "posts" }} />}
        >
          <ExternalLinkIcon /> Project
        </Button>
      </span>
    </div>
  )
}
