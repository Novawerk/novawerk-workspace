// The post as each platform shows it: Xiaohongshu's note, a LinkedIn update, a Discord message,
// an article (newsletter, blog, GitHub). The pictures are the template card in the platform's
// size (rendered by the API from the editor's unsaved text) and the post's own pictures.

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  HeartIcon,
  ImageOffIcon,
  LoaderCircleIcon,
  MessageCircleIcon,
  Repeat2Icon,
  SendIcon,
  StarIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  CARD_FORMATS,
  POST_LANGS,
  POST_PLATFORM_INFO,
  postPlatforms,
  type PostLang,
  type PostPlatform,
} from "@nw/contracts"
import { NovaStar } from "@nw/ui/compound/nova-star"
import { Button } from "@nw/ui/core/components/ui/button"
import { cn } from "@nw/ui/lib/utils"

import { errorMessage } from "@/lib/errors"
import { formatDate } from "@/lib/format"
import type { Post } from "@/lib/types"

import { downloadAllCards, downloadCard, downloadPicture, pictureName, useCardImage } from "./card-image"
import { LANG_LABEL, LANG_SHORT, PlatformMark } from "./post-meta"
import { copyText, toCard, type PostForm } from "./post-form"

type Picture = { kind: "card"; url: string | null; loading: boolean; error: string | null } | { kind: "image"; url: string; alt?: string }

export function PostPreview({
  post,
  form,
  lang,
  onLangChange,
}: {
  post: Post
  form: PostForm
  lang: PostLang
  onLangChange: (lang: PostLang) => void
}) {
  const platforms = postPlatforms({ kind: post.kind, platforms: form.platforms, langs: form.langs })
  const [picked, setPicked] = React.useState<PostPlatform | null>(null)
  const platform = picked && platforms.includes(picked) ? picked : (platforms[0] ?? null)
  const info = platform ? POST_PLATFORM_INFO[platform] : null
  const langs = info ? POST_LANGS.filter((l) => info.langs.includes(l) && form.langs.includes(l)) : form.langs
  const shownLang = langs.includes(lang) ? lang : (langs[0] ?? lang)
  const format = info?.format ?? "portrait"
  const card = toCard(form[shownLang].card)

  const cardImage = useCardImage(
    form.withCard && platform ? { kind: post.kind, lang: shownLang, format, card, photoUrl: form.photoUrl } : null,
  )
  const pictures: Picture[] = [
    ...(form.withCard ? [{ kind: "card" as const, url: cardImage.url, loading: cardImage.loading, error: cardImage.error }] : []),
    ...form.images.filter((i) => !i.lang || i.lang === shownLang).map((i) => ({ kind: "image" as const, url: i.url, alt: i.alt })),
  ]
  const copy = form[shownLang]
  const [busy, setBusy] = React.useState(false)

  const copyPost = async () => {
    try {
      await navigator.clipboard.writeText(copyText(copy))
      toast.success(`Copied the ${LANG_LABEL[shownLang]} title and text`)
    } catch {
      toast.error("We couldn't reach the clipboard")
    }
  }

  const downloadAll = async (all: boolean) => {
    setBusy(true)
    try {
      if (form.withCard) {
        if (all) await downloadAllCards(post, shownLang, card, form.photoUrl)
        else await downloadCard(post, shownLang, format, card, form.photoUrl)
      }
      if (!all) {
        // Numbered in the order they go out, after the card.
        let n = form.withCard ? 1 : 0
        for (const p of pictures) {
          if (p.kind === "image") await downloadPicture(p.url, `${String(++n).padStart(2, "0")}-${pictureName(p.url, "picture.png")}`)
        }
      }
    } catch (err) {
      toast.error("We couldn't make the picture", { description: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {platforms.length > 0 ? (
          <div role="tablist" aria-label="Platform" className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={platform === p}
                onClick={() => setPicked(p)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  platform === p && "bg-background font-medium text-foreground shadow-sm",
                )}
              >
                <PlatformMark platform={p} />
                {POST_PLATFORM_INFO[p].label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick a platform under Content to see the post as it shows there.</p>
        )}
        {langs.length > 1 && (
          <div role="group" aria-label="Language" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
            {langs.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={shownLang === l}
                onClick={() => onLangChange(l)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-muted-foreground transition-colors hover:text-foreground",
                  shownLang === l && "bg-background font-medium text-foreground shadow-sm",
                )}
              >
                {LANG_SHORT[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center rounded-xl bg-muted/50 px-4 py-6 sm:py-8">
        <div className="w-full max-w-sm">
          {platform === "xiaohongshu" && <XiaohongshuNote copy={copy} pictures={pictures} format={format} dueOn={form.dueOn} />}
          {platform === "linkedin" && <LinkedInUpdate copy={copy} pictures={pictures} format={format} />}
          {platform === "discord" && <DiscordMessage copy={copy} pictures={pictures} format={format} />}
          {(platform === "newsletter" || platform === "blog" || platform === "github") && (
            <Article copy={copy} pictures={pictures} format={format} platform={platform} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {info ? <Limits title={copy.title} body={copy.body} platform={platform!} /> : <span />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyPost()} disabled={!copyText(copy)}>
            <CopyIcon /> Copy text
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || pictures.length === 0} onClick={() => void downloadAll(false)}>
            {busy ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
            {pictures.length > 1 ? `${pictures.length} pictures` : "Picture"}
            {info && form.withCard ? ` · ${CARD_FORMATS[format].label}` : ""}
          </Button>
          {form.withCard && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void downloadAll(true)}>
              Card in all sizes
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Limits({ title, body, platform }: { title: string; body: string; platform: PostPlatform }) {
  const info = POST_PLATFORM_INFO[platform]
  const titleLength = [...title.trim()].length
  const bodyLength = [...body.trim()].length
  return (
    <p className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground tabular-nums">
      {info.titleLimit && (
        <span className={cn(titleLength > info.titleLimit && "font-medium text-warning")}>
          Title {titleLength}/{info.titleLimit}
        </span>
      )}
      <span className={cn(bodyLength > info.bodyLimit && "font-medium text-warning")}>
        Text {bodyLength.toLocaleString()}/{info.bodyLimit.toLocaleString()}
      </span>
    </p>
  )
}

function PictureView({ picture, className }: { picture: Picture; className?: string }) {
  if (picture.kind === "image") {
    return <img src={picture.url} alt={picture.alt ?? ""} className={cn("size-full object-cover", className)} />
  }
  if (picture.url) return <img src={picture.url} alt="The template card" className={cn("size-full object-contain", className)} />
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 p-4 text-center text-xs text-muted-foreground">
      {picture.error ? (
        <>
          <ImageOffIcon className="size-5" />
          {picture.error}
        </>
      ) : (
        <LoaderCircleIcon className="size-5 animate-spin" />
      )}
    </div>
  )
}

/** Swipe through the pictures, like the apps do. */
function Carousel({ pictures, ratio, className }: { pictures: Picture[]; ratio: string; className?: string }) {
  const [index, setIndex] = React.useState(0)
  const at = Math.min(index, pictures.length - 1)
  if (pictures.length === 0) return null
  const current = pictures[at]!
  return (
    <div className={cn("group/carousel relative w-full overflow-hidden bg-muted", className)} style={{ aspectRatio: ratio }}>
      <PictureView picture={current} />
      {current.kind === "card" && current.loading && current.url && (
        <span className="absolute top-2 right-2 rounded-full bg-background/80 p-1">
          <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
        </span>
      )}
      {pictures.length > 1 && (
        <>
          <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 text-[11px] leading-5 text-white tabular-nums">
            {at + 1}/{pictures.length}
          </span>
          {at > 0 && (
            <button
              type="button"
              aria-label="Previous picture"
              onClick={() => setIndex(at - 1)}
              className="absolute top-1/2 left-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-sm"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
          )}
          {at < pictures.length - 1 && (
            <button
              type="button"
              aria-label="Next picture"
              onClick={() => setIndex(at + 1)}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-sm"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          )}
          <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {pictures.map((_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full bg-white/60", i === at && "bg-white")} />
            ))}
          </span>
        </>
      )}
    </div>
  )
}

const ratioOf = (format: keyof typeof CARD_FORMATS) => `${CARD_FORMATS[format].width} / ${CARD_FORMATS[format].height}`

function Avatar({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-[#efe9d8]", className)}>
      <NovaStar className="size-5" />
    </span>
  )
}

/** Hashtags in the platform's blue. */
function Body({ text, className, clamp }: { text: string; className?: string; clamp?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const parts = text.trim().split(/(#[^\s#]+)/g)
  if (!text.trim()) return <p className={cn("text-muted-foreground italic", className)}>No text yet</p>
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-wrap", clamp && !open && "line-clamp-3")}>
        {parts.map((part, i) => (part.startsWith("#") ? <span key={i} className="text-[#13386c] dark:text-sky-300">{part}</span> : part))}
      </p>
      {clamp && !open && text.trim().split("\n").length + text.length / 60 > 3 && (
        <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:underline">
          …see more
        </button>
      )}
    </div>
  )
}

type CopyView = { title: string; body: string; card: unknown }

function XiaohongshuNote({ copy, pictures, format, dueOn }: { copy: CopyView; pictures: Picture[]; format: keyof typeof CARD_FORMATS; dueOn: string }) {
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border bg-background text-[13px] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar className="size-7" />
        <span className="font-medium">Novawerk</span>
        <span className="ml-auto rounded-full border border-[#ff2442] px-2.5 text-[11px] leading-5 text-[#ff2442]">关注</span>
      </div>
      {pictures.length > 0 ? (
        <Carousel pictures={pictures} ratio={ratioOf(format)} />
      ) : (
        <p className="mx-3 rounded-md bg-warning/10 px-3 py-6 text-center text-xs text-warning">Xiaohongshu needs at least one picture.</p>
      )}
      <div className="flex flex-col gap-1.5 px-3 py-3">
        <p className="font-semibold">{copy.title.trim() || <span className="text-muted-foreground">No title yet</span>}</p>
        <Body text={copy.body} className="leading-relaxed" />
        <p className="text-[11px] text-muted-foreground">{formatDate(dueOn)} · 柏林</p>
      </div>
      <div className="flex items-center gap-4 border-t px-3 py-2 text-muted-foreground">
        <span className="flex-1 rounded-full bg-muted px-3 text-[11px] leading-6">说点什么…</span>
        <HeartIcon className="size-4" />
        <StarIcon className="size-4" />
        <MessageCircleIcon className="size-4" />
      </div>
    </div>
  )
}

function LinkedInUpdate({ copy, pictures, format }: { copy: CopyView; pictures: Picture[]; format: keyof typeof CARD_FORMATS }) {
  const text = [copy.title.trim(), copy.body.trim()].filter(Boolean).join("\n\n")
  return (
    <div className="overflow-hidden rounded-lg border bg-background text-[13px] shadow-sm">
      <div className="flex gap-2 px-3 pt-3">
        <Avatar className="size-10 rounded-md" />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold">Novawerk</span>
          <span className="text-[11px] text-muted-foreground">Non-profit · Berlin</span>
          <span className="text-[11px] text-muted-foreground">Now · 🌐</span>
        </div>
      </div>
      <Body text={text} clamp className="px-3 py-2 leading-relaxed" />
      {pictures.length > 0 && <Carousel pictures={pictures} ratio={ratioOf(format)} />}
      <div className="flex justify-around border-t px-2 py-1.5 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1"><ThumbsUpIcon className="size-3.5" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircleIcon className="size-3.5" /> Comment</span>
        <span className="flex items-center gap-1"><Repeat2Icon className="size-3.5" /> Repost</span>
        <span className="flex items-center gap-1"><SendIcon className="size-3.5" /> Send</span>
      </div>
    </div>
  )
}

function DiscordMessage({ copy, pictures, format }: { copy: CopyView; pictures: Picture[]; format: keyof typeof CARD_FORMATS }) {
  return (
    <div className="flex gap-3 rounded-lg bg-[#313338] px-3 py-3 text-[13px] text-[#dbdee1]">
      <Avatar className="size-9" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span className="font-medium text-white">Novawerk</span>
          <span className="text-[11px] text-[#949ba4]">Today at 14:00</span>
        </p>
        {copy.title.trim() && <p className="font-semibold text-white">{copy.title.trim()}</p>}
        <Body text={copy.body} className="leading-relaxed" />
        {pictures.length > 0 && <Carousel pictures={pictures} ratio={ratioOf(format)} className="mt-1 max-w-[360px] rounded-md" />}
      </div>
    </div>
  )
}

function Article({ copy, pictures, format, platform }: { copy: CopyView; pictures: Picture[]; format: keyof typeof CARD_FORMATS; platform: PostPlatform }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 text-[13px]">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{POST_PLATFORM_INFO[platform].label}</span>
      <h3 className="font-heading text-lg leading-snug font-semibold">{copy.title.trim() || <span className="text-muted-foreground">No title yet</span>}</h3>
      {pictures.length > 0 && <Carousel pictures={pictures} ratio={ratioOf(format)} className="rounded-md" />}
      <Body text={copy.body} className="leading-relaxed" />
    </div>
  )
}
