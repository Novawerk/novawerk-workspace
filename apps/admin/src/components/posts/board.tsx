// The post board's pieces: status columns and the post card. The Posts page and a project's
// Posts tab both use them.

import { Link } from "@tanstack/react-router"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

import { type PostStatus } from "@nw/contracts"
import { statusLabel } from "@nw/ui/compound/status-badge"
import { cn } from "@nw/ui/lib/utils"

import { formatDate } from "@/lib/format"
import type { Post } from "@/lib/types"

import { LangMarks, PlatformMarks, PostThumb, RepoMark, momentLabel, ownerName, postTitle } from "./post-meta"

export { momentLabel } from "./post-meta"

/** The board's columns: where a post is on its way out. */
export const COLUMNS: PostStatus[] = ["planned", "drafted", "approved", "published"]
const OPEN: PostStatus[] = ["planned", "drafted", "approved"]

const byDue = (a: Post, b: Post) => a.dueOn.localeCompare(b.dueOn) || a.seq - b.seq

/** The column headings with their counts. */
export function ColumnHeads({ posts, columns, className }: { posts: Post[]; columns: PostStatus[]; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((status) => (
        <div
          key={status}
          className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {statusLabel(status)}
          <span className="rounded-full bg-background px-1.5 text-[11px] tabular-nums normal-case">
            {posts.filter((p) => p.status === status).length}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Columns({
  posts,
  columns,
  today,
  showProject,
}: {
  posts: Post[]
  columns: PostStatus[]
  today: string
  showProject?: boolean
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((status) => {
        const own = posts.filter((p) => p.status === status).sort(byDue)
        return (
          <div key={status} className="flex min-h-24 flex-col gap-2 rounded-md bg-muted/40 p-2">
            {own.map((post) => (
              <PostCard key={post.id} post={post} today={today} showProject={showProject} />
            ))}
            {own.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted-foreground/70">Nothing here</p>}
          </div>
        )
      })}
    </div>
  )
}

export function PostCard({ post, today, showProject }: { post: Post; today: string; showProject?: boolean }) {
  const overdue = post.dueOn < today && OPEN.includes(post.status)
  const title = postTitle(post)
  return (
    <Link
      to="/posts/$postId"
      params={{ postId: post.id }}
      className="group flex flex-col gap-2 rounded-md border bg-card p-2 text-sm shadow-xs transition-colors hover:border-foreground/25"
    >
      <PostThumb post={post} />
      <div className="flex flex-col gap-1 px-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {showProject && <span className={cn("truncate font-medium", !post.project && "text-primary")}>{ownerName(post)}</span>}
          {showProject && <span aria-hidden>·</span>}
          <span className="truncate">{momentLabel(post.kind, post.seq, post.label)}</span>
          {post.sourcePath && <RepoMark path={post.sourcePath} className="ml-auto shrink-0" />}
        </span>
        <span className="line-clamp-2 leading-snug">{title ?? <span className="text-muted-foreground">No draft yet</span>}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <LangMarks langs={post.langs} />
          <PlatformMarks post={post} />
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {post.draftRequestedAt && <LoaderCircleIcon aria-label="Drafting" className="size-3 animate-spin" />}
            {post.draftError && !post.draftRequestedAt && (
              <CircleAlertIcon aria-label="The draft failed" className="size-3 text-destructive" />
            )}
            <span className={cn("tabular-nums", overdue && "font-medium text-warning")}>{formatDate(post.dueOn)}</span>
          </span>
        </span>
      </div>
    </Link>
  )
}
