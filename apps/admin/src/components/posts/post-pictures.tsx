// A post's own pictures: photos, screenshots, a poster made with any tool. They go out after the
// template card (or alone), in this order. Each can be in both language versions or only one.

import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, LinkIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { MAX_POST_IMAGES, POST_LANGS, postImage, type PostImageInput, type PostLang } from "@nw/contracts"
import { Button } from "@nw/ui/core/components/ui/button"
import { Input } from "@nw/ui/core/components/ui/input"
import { cn } from "@nw/ui/lib/utils"

import { FileButton } from "@/components/file-button"
import { errorMessage } from "@/lib/errors"
import type { Post } from "@/lib/types"
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads"

import { LANG_SHORT } from "./post-meta"

export function PostPictures({
  images,
  onChange,
  langs,
  project,
  disabled,
}: {
  images: PostImageInput[]
  onChange: (images: PostImageInput[]) => void
  langs: readonly PostLang[]
  project: Post["project"]
  disabled?: boolean
}) {
  const [uploading, setUploading] = React.useState(0)
  const [link, setLink] = React.useState("")
  const room = MAX_POST_IMAGES - images.length
  const latest = React.useRef(images)
  latest.current = images

  const add = (urls: string[]) => {
    const fresh = urls.filter((url) => !latest.current.some((i) => i.url === url)).slice(0, MAX_POST_IMAGES - latest.current.length)
    if (fresh.length) onChange([...latest.current, ...fresh.map((url) => ({ url }))])
  }
  const update = (index: number, patch: Partial<PostImageInput>) =>
    onChange(images.map((img, i) => (i === index ? { ...img, ...patch } : img)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...images]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item!)
    onChange(next)
  }

  const upload = async (files: File[]) => {
    const take = files.slice(0, room)
    if (files.length > take.length) toast.warning(`Up to ${MAX_POST_IMAGES} pictures; added the first ${take.length}.`)
    setUploading((n) => n + take.length)
    for (const file of take) {
      try {
        add([await uploadImage(file)])
      } catch (err) {
        toast.error(`We couldn't upload ${file.name}`, { description: errorMessage(err) })
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const addLink = (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = postImage.shape.url.safeParse(link.trim())
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Use an https:// image link")
      return
    }
    add([parsed.data])
    setLink("")
  }

  const projectPictures = project
    ? [...(project.coverUrl ? [project.coverUrl] : []), ...project.gallery.map((g) => g.url)].filter((url, i, all) => all.indexOf(url) === i)
    : []

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {images.map((img, i) => (
            <li key={img.url} className="flex items-center gap-3 rounded-md border p-2">
              <span className="w-4 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <a href={img.url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={img.url} alt={img.alt ?? ""} loading="lazy" className="size-14 rounded-sm border object-cover" />
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  value={img.alt ?? ""}
                  onChange={(e) => update(i, { alt: e.target.value || undefined })}
                  placeholder="What it shows (for people who can't see it)"
                  aria-label={`Picture ${i + 1}: what it shows`}
                  className="h-8 text-xs"
                  disabled={disabled}
                  maxLength={300}
                />
                <div role="group" aria-label={`Picture ${i + 1}: language`} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  In
                  {([undefined, ...POST_LANGS] as const).map((l) => (
                    <button
                      key={l ?? "both"}
                      type="button"
                      disabled={disabled || (l !== undefined && !langs.includes(l))}
                      aria-pressed={img.lang === l}
                      onClick={() => update(i, { lang: l })}
                      className={cn(
                        "rounded border px-1.5 leading-5 disabled:opacity-40",
                        img.lang === l ? "border-primary bg-primary/10 text-foreground" : "hover:border-foreground/30",
                      )}
                    >
                      {l ? LANG_SHORT[l] : "both"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpIcon />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Move down" disabled={disabled || i === images.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove"
                  disabled={disabled}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No pictures of its own. Real photos and screenshots work best; a poster made with any tool works too.
        </p>
      )}

      {!disabled && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FileButton accept={IMAGE_ACCEPT} multiple disabled={room <= 0} onFiles={(files) => void upload(files)}>
              Upload
            </FileButton>
            {uploading > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-3.5 animate-spin" /> Uploading {uploading}…
              </span>
            )}
            <form onSubmit={addLink} className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <LinkIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… image link" className="h-8 pl-8 text-xs" aria-label="Image link" />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={!link.trim() || room <= 0}>
                Add
              </Button>
            </form>
          </div>
          {projectPictures.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">From the project:</span>
              {projectPictures.map((url) => {
                const used = images.some((i) => i.url === url)
                return (
                  <button
                    key={url}
                    type="button"
                    disabled={used || room <= 0}
                    title={used ? "Already in the post" : "Add to the post"}
                    onClick={() => add([url])}
                    className="relative size-9 overflow-hidden rounded-sm border disabled:opacity-40"
                  >
                    <img src={url} alt="" loading="lazy" className="size-full object-cover" />
                    {!used && <ImagePlusIcon className="absolute right-0.5 bottom-0.5 size-3 rounded-sm bg-background/80 p-px" />}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {images.length}/{MAX_POST_IMAGES} · PNG, JPEG, GIF, WebP or AVIF up to 10 MB. Xiaohongshu shows them in this order after the card.
          </p>
        </div>
      )}
    </div>
  )
}
