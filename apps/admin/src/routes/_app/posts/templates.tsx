import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon, ImageOffIcon, LoaderCircleIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  CARD_FORMATS,
  CARD_DESIGNS,
  CARD_FORMAT_NAMES,
  POST_KINDS,
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORMS,
  POST_PLATFORM_INFO,
  POST_TEMPLATES,
  type CardFormat,
  type PostKind,
  type PostLang,
} from "@nw/contracts"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Label } from "@nw/ui/core/components/ui/label"
import { cn } from "@nw/ui/lib/utils"

import { Page } from "@/components/page"
import { CopyLine, NewPostDialog } from "@/components/posts/add-post"
import { saveBlob, useCardImage } from "@/components/posts/card-image"
import { CARD_CREAM, CARD_GREEN, CARD_INK, LANG_LABEL, PlatformMark } from "@/components/posts/post-meta"
import { dataSource } from "@/lib/data-source"
import { errorMessage } from "@/lib/errors"

type Search = { kind?: PostKind }

export const Route = createFileRoute("/_app/posts/templates")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    kind: typeof search.kind === "string" && (POST_KINDS as readonly string[]).includes(search.kind) ? (search.kind as PostKind) : undefined,
  }),
  component: TemplatesPage,
})

/** Lifecycle order, then anything else. */
const ORDER: PostKind[] = ["kickoff", "progress", "behind_the_scenes", "launch", "ten_day", "retro", "custom"]

/** Which platforms use a picture size. */
const usedBy = (format: CardFormat) => POST_PLATFORMS.filter((p) => POST_PLATFORM_INFO[p].format === format)

/** The post templates we have: what each kind is for, its fields, an example, and its card in every size. */
function TemplatesPage() {
  const { kind = "kickoff" } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          title="Templates"
          description="Every kind of post we write: what it is for, when it goes out, what it says, and its card. Start a post from one."
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Templates" className="flex flex-col gap-1.5 lg:sticky lg:top-0 lg:self-start">
          {ORDER.map((k) => (
            <TemplateButton
              key={k}
              kind={k}
              active={k === kind}
              onClick={() => void navigate({ search: { kind: k }, replace: true })}
            />
          ))}
        </nav>
        <TemplateDetail key={kind} kind={kind} />
      </div>
    </Page>
  )
}

function TemplateButton({ kind, active, onClick }: { kind: PostKind; active: boolean; onClick: () => void }) {
  const t = POST_TEMPLATES[kind]
  const card = t.example.zh.card
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:border-foreground/25 hover:bg-muted/40",
      )}
    >
      {/* A sketch of the card in the brand's colours; the real one renders on the right. */}
      <span
        className="relative flex h-14 w-[42px] shrink-0 flex-col justify-end overflow-hidden rounded-[3px] border border-black/20 p-1"
        style={{ backgroundColor: CARD_INK, color: CARD_CREAM }}
      >
        <span className="absolute top-1 right-1 left-1 h-px" style={{ backgroundColor: CARD_GREEN }} />
        <span className="line-clamp-2 origin-left scale-x-[0.86] font-serif text-[8px] leading-none font-black uppercase">{card.headline}</span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium">{POST_KIND_INFO[kind].zh}</span>
          <span className="truncate text-xs text-muted-foreground">{kind === "custom" ? "Anything else" : POST_KIND_INFO[kind].label}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">{t.when.zh}</span>
      </span>
    </button>
  )
}

function TemplateDetail({ kind }: { kind: PostKind }) {
  const t = POST_TEMPLATES[kind]
  const info = POST_KIND_INFO[kind]
  const [lang, setLang] = React.useState<PostLang>("zh")
  const [format, setFormat] = React.useState<CardFormat>("portrait")
  const [withPhoto, setWithPhoto] = React.useState(t.photo)
  const [creating, setCreating] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)

  const example = t.example[lang]
  const request = { kind, lang, format, card: example.card, samplePhoto: withPhoto }
  const image = useCardImage(request)
  const { width, height } = CARD_FORMATS[format]

  const download = async () => {
    setDownloading(true)
    try {
      saveBlob(await dataSource.renderCard(request), `template-${kind.replace(/_/g, "-")}-${lang}-${format}.png`)
    } catch (err) {
      toast.error("We couldn't make the picture", { description: errorMessage(err) })
    } finally {
      setDownloading(false)
    }
  }

  const command =
    kind === "custom"
      ? 'pnpm post new --name "Open day" --date <YYYY-MM-DD>'
      : `pnpm post new --project <slug> --kind ${kind}${kind === "progress" ? " --week <n>" : kind === "retro" ? " --day 30" : ""} --date <YYYY-MM-DD>`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="flex flex-wrap items-baseline gap-2 font-heading text-xl font-semibold">
            {info.zh}
            <span className="text-base font-normal text-muted-foreground">{kind === "custom" ? "Custom" : info.label}</span>
          </h2>
          <p className="text-sm">{t.purpose[lang]}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t.when[lang]}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              {info.platforms.map((p) => (
                <PlatformMark key={p} platform={p} />
              ))}
              <span className="ml-1">{info.platforms.map((p) => POST_PLATFORM_INFO[p].label).join(", ")}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Language" className="flex h-8 items-center rounded-lg border p-0.5 text-xs">
            {POST_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cn("h-full rounded-md px-3 text-muted-foreground", lang === l && "bg-muted font-medium text-foreground")}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> Use this template
          </Button>
          {creating && <NewPostDialog kind={kind} onClose={() => setCreating(false)} />}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="shadow-none">
          <CardHeader className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>The card</CardTitle>
              <Badge variant="secondary" title={CARD_DESIGNS[kind].detail}>
                {CARD_DESIGNS[kind].label}
              </Badge>
            </div>
            <div role="tablist" aria-label="Size" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
              {CARD_FORMAT_NAMES.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={format === f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "flex flex-col items-center rounded-md px-1 py-1 text-xs text-muted-foreground",
                    format === f && "bg-background font-medium text-foreground shadow-xs",
                  )}
                >
                  {CARD_FORMATS[f].label}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {usedBy(f).map((p) => POST_PLATFORM_INFO[p].label).join(" · ") || "—"}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div
              className="relative mx-auto flex w-full max-w-[460px] items-center justify-center overflow-hidden rounded-md border bg-muted"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              {image.url && <img src={image.url} alt={`The ${info.label} card, ${CARD_FORMATS[format].label}`} className="size-full object-contain" />}
              {!image.url && !image.error && <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />}
              {image.error && !image.url && (
                <p className="flex flex-col items-center gap-1 p-4 text-center text-xs text-muted-foreground">
                  <ImageOffIcon className="size-5" />
                  {image.error}
                </p>
              )}
              {image.loading && image.url && (
                <span className="absolute top-2 right-2 rounded-full bg-background/80 p-1">
                  <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id="template-photo" checked={withPhoto} onCheckedChange={setWithPhoto} />
                <Label htmlFor="template-photo" className="text-xs font-normal">
                  With one of the project's photos
                </Label>
              </div>
              <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
                <DownloadIcon /> {CARD_FORMATS[format].label}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {CARD_DESIGNS[kind].detail}. Assembled from the template, never generated: black, our serif squeezed tall,
              a HUD in the Nova Star&apos;s green, and the words below. Put a line break in a headline or a quote to
              choose where it breaks.
            </p>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>What it says</CardTitle>
              <CardDescription>The fields the text carries, in order. Facts only: anything missing stays a 【待补充】.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
                {t.fields[lang].map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Example</CardTitle>
              <CardDescription>How it reads. The names and numbers are made up.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-[13px] leading-relaxed">
              <p className="font-semibold">{example.title}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{example.body}</p>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>In the repo</CardTitle>
              <CardDescription>Start a folder from this template, then let Claude Code write it (the nw-posts skill).</CardDescription>
            </CardHeader>
            <CardContent>
              <CopyLine text={command} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
