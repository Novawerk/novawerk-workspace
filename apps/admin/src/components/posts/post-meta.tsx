// Small pieces every post view shares: its name, the languages and platforms it goes to, where
// it was written, and a thumbnail drawn in the brand's colours (no API call).

import { FolderGit2Icon } from "lucide-react"

import {
  CARD_DESIGNS,
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORM_INFO,
  postPlatforms,
  type PostKind,
  type PostLang,
  type PostPlatform,
} from "@nw/contracts"
import { cn } from "@nw/ui/lib/utils"

import type { Post } from "@/lib/types"

/** "进展帖 · Week 4", "阶段回顾 · Day 30", "立项卡", and a custom post's own name. */
export const momentLabel = (kind: PostKind, seq: number, label?: string | null) => {
  if (kind === "custom") return label || POST_KIND_INFO.custom.zh
  const zh = POST_KIND_INFO[kind].zh
  if (kind === "progress" && seq) return `${zh} · Week ${seq}`
  if (kind === "retro" && seq) return `${zh} · Day ${seq}`
  return zh
}

/** Whose post it is: the project, or Novawerk itself. */
export const ownerName = (post: Pick<Post, "project">) => post.project?.title ?? "Novawerk"

/** The title people see first: the post's own title in either language, else its name. */
export const postTitle = (post: Post) => post.content?.zh.title || post.content?.en.title || null

export const LANG_SHORT: Record<PostLang, string> = { zh: "中", en: "EN" }
export const LANG_LABEL: Record<PostLang, string> = { zh: "中文", en: "English" }

/** The cards' colours (packages/promo/src/cards/templates.ts). */
export const CARD_INK = "#050505"
export const CARD_CREAM = "#f3efe6"
export const CARD_GREEN = "#38e07b"

/** A monogram and colour per platform, for the small chips. */
export const PLATFORM_MARK: Record<PostPlatform, { mark: string; className: string }> = {
  xiaohongshu: { mark: "小", className: "bg-[#ff2442] text-white" },
  linkedin: { mark: "in", className: "bg-[#0a66c2] text-white" },
  discord: { mark: "D", className: "bg-[#5865f2] text-white" },
  newsletter: { mark: "@", className: "bg-foreground/80 text-background" },
  blog: { mark: "B", className: "bg-[#1f7a4a] text-white" },
  github: { mark: "GH", className: "bg-[#24292f] text-white" },
}

export function PlatformMark({ platform, className }: { platform: PostPlatform; className?: string }) {
  const { mark, className: tone } = PLATFORM_MARK[platform]
  return (
    <span
      title={POST_PLATFORM_INFO[platform].label}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] px-0.5 text-[9px] leading-none font-semibold",
        tone,
        className,
      )}
    >
      {mark}
    </span>
  )
}

/** Where it goes: one mark per platform. */
export function PlatformMarks({ post, className }: { post: Pick<Post, "kind" | "platforms" | "langs">; className?: string }) {
  const platforms = postPlatforms(post)
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-label={platforms.map((p) => POST_PLATFORM_INFO[p].label).join(", ")}>
      {platforms.map((p) => (
        <PlatformMark key={p} platform={p} />
      ))}
    </span>
  )
}

/** 中 · EN */
export function LangMarks({ langs, className }: { langs: readonly PostLang[]; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      {POST_LANGS.filter((l) => langs.includes(l)).map((l) => (
        <span key={l} title={LANG_LABEL[l]} className="rounded-[4px] border px-1 text-[9px] leading-[14px] font-medium text-muted-foreground">
          {LANG_SHORT[l]}
        </span>
      ))}
    </span>
  )
}

/** "Written in the repo" */
export function RepoMark({ path, className }: { path: string; className?: string }) {
  return (
    <span title={`Written in the repo: ${path}`} className={cn("inline-flex items-center text-muted-foreground", className)}>
      <FolderGit2Icon className="size-3.5" />
      <span className="sr-only">Written in the repo</span>
    </span>
  )
}

/**
 * A thumbnail of the post: its first own picture, else a sketch of the template card in the
 * brand's colours, else nothing (a text-only post).
 */
export function PostThumb({ post, className }: { post: Post; className?: string }) {
  const picture = post.images[0]?.url
  if (picture && !post.withCard) {
    return <img src={picture} alt="" loading="lazy" className={cn("h-20 w-full rounded-sm border object-cover", className)} />
  }
  if (!post.withCard) return null
  const card = [post.content?.zh.card, post.content?.en.card].find((c) => c?.headline) ?? null
  // The card's look (packages/promo/src/cards): black, squeezed serif, a HUD in green.
  return (
    <div
      className={cn("relative flex h-20 w-full overflow-hidden rounded-sm border border-black/20", className)}
      style={{ backgroundColor: CARD_INK, color: CARD_CREAM }}
    >
      <span className="absolute top-1.5 left-2 right-2 flex items-center justify-between font-mono text-[7px] tracking-[0.15em] uppercase">
        <span style={{ color: CARD_CREAM, opacity: 0.8 }}>Novawerk</span>
        <span style={{ color: CARD_GREEN }}>{CARD_DESIGNS[post.kind].label.replace("NN", String(post.seq).padStart(2, "0"))}</span>
      </span>
      <div className="relative mt-auto flex min-w-0 flex-col gap-0.5 p-2 pr-10">
        {card?.eyebrow && <span className="truncate font-serif text-[8px] tracking-[0.2em] opacity-70">{card.eyebrow}</span>}
        <span className="line-clamp-2 origin-left scale-x-[0.86] font-serif text-[14px] leading-none font-black uppercase">
          {card?.headline || <span className="opacity-40">{momentLabel(post.kind, post.seq, post.label)}</span>}
        </span>
      </div>
      {picture && (
        <img src={picture} alt="" loading="lazy" className="absolute right-1.5 bottom-1.5 size-9 rounded-[3px] border border-white/60 object-cover shadow-sm" />
      )}
      {post.images.length > 1 && (
        <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-1.5 text-[9px] leading-4 text-white tabular-nums">
          +{post.images.length}
        </span>
      )}
    </div>
  )
}
