import * as React from "react"
import { Link, useBlocker } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  FolderGit2Icon,
  InfoIcon,
  LoaderCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORMS,
  POST_PLATFORM_INFO,
  emptyLangs,
  placeholdersIn,
  postLabel,
  postPlatforms,
  postUpdateInput,
  type PostLang,
} from "@nw/contracts"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nw/ui/core/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@nw/ui/core/components/ui/dropdown-menu"
import { Input } from "@nw/ui/core/components/ui/input"
import { Label } from "@nw/ui/core/components/ui/label"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Textarea } from "@nw/ui/core/components/ui/textarea"
import { cn } from "@nw/ui/lib/utils"

import { FormField, SwitchRow } from "@/components/form-field"
import { AgentRailContent } from "@/components/agent-rail"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { Page } from "@/components/page"
import { dataSource } from "@/lib/data-source"
import { errorMessage, issuesFromParse } from "@/lib/errors"
import { formatDate, formatDateTime, formatRelative } from "@/lib/format"
import {
  useApprovePost,
  usePublishPost,
  useRequestDraft,
  useRestorePost,
  useSkipPost,
  useUnpublishPost,
  useUpdatePost,
} from "@/lib/queries"
import type { Post, PostExportLink } from "@/lib/types"

import { CopyLine, ToggleChips, platformsFor } from "./add-post"
import { LANG_LABEL, PlatformMark } from "./post-meta"
import { PostChat } from "./post-chat"
import { PostPictures } from "./post-pictures"
import { PostPreview } from "./post-preview"
import { formPatch, isBlank, isDrawable, toContent, toPostForm, type CardForm, type PostForm } from "./post-form"

/** A draft request the agent hasn't answered after this long is probably stuck. */
const SLOW_DRAFT_MS = 10 * 60_000

/**
 * One post, in two tabs: a preview per platform (the default), and its content (what it is and
 * where it goes, the text in each language, the pictures). The writer's chat sits in the agent
 * rail: it keeps the brief and has the promo agent rewrite the draft.
 */
export function PostEditor({ post }: { post: Post }) {
  const update = useUpdatePost()
  const approve = useApprovePost()
  const requestDraft = useRequestDraft()
  const skip = useSkipPost()
  const restore = useRestorePost()
  const publish = usePublishPost()
  const unpublish = useUnpublishPost()

  const [form, setForm] = React.useState(() => toPostForm(post))
  const [lang, setLang] = React.useState<PostLang>(post.langs[0] ?? "zh")
  const [issues, setIssues] = React.useState<Record<string, string[]>>({})
  const [exporting, setExporting] = React.useState(false)
  /** The post as it will look, or its fields to edit. */
  const [view, setView] = React.useState<View>("preview")

  // A new draft from the agent replaces the form, unless someone is mid-edit.
  const savedForm = React.useMemo(() => toPostForm(post), [post])
  const lastSaved = React.useRef(savedForm)
  const dirty = JSON.stringify(form) !== JSON.stringify(lastSaved.current)
  React.useEffect(() => {
    if (JSON.stringify(savedForm) === JSON.stringify(lastSaved.current)) return
    if (!dirty) setForm(savedForm)
    lastSaved.current = savedForm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedForm])

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Leave without saving? Your changes are lost."),
    enableBeforeUnload: () => dirty,
  })

  const repo = post.sourcePath
  const closed = post.status === "published" || post.status === "skipped"
  const drafting = Boolean(post.draftRequestedAt)
  const editable = !closed && !drafting && !repo
  const busy =
    update.isPending ||
    approve.isPending ||
    requestDraft.isPending ||
    skip.isPending ||
    restore.isPending ||
    publish.isPending ||
    unpublish.isPending
  const content = toContent(form)
  const blank = isBlank(form)
  const gaps = blank ? [] : placeholdersIn(content, form.langs)
  const unwritten = blank ? [] : emptyLangs(content, form.langs)
  const editLang = form.langs.includes(lang) ? lang : form.langs[0]!

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setCopy = (field: "title" | "body", value: string) =>
    setForm((f) => ({ ...f, [editLang]: { ...f[editLang], [field]: value } }))
  const setCard = (field: keyof CardForm, value: string) =>
    setForm((f) => ({ ...f, [editLang]: { ...f[editLang], card: { ...f[editLang].card, [field]: value } } }))

  const save = async (): Promise<boolean> => {
    const patch = formPatch(lastSaved.current, form, post.kind)
    const parsed = postUpdateInput.safeParse(patch)
    if (!parsed.success) {
      setIssues(issuesFromParse(parsed.error))
      toast.error("Something doesn't fit", { description: parsed.error.issues[0]?.message })
      return false
    }
    setIssues({})
    try {
      const updated = await update.mutateAsync({ id: post.id, patch })
      const next = toPostForm(updated)
      lastSaved.current = next
      setForm(next)
      toast.success(post.status === "approved" && updated.status === "drafted" ? "Saved. It needs approval again." : "Saved")
      return true
    } catch (err) {
      toast.error("We couldn't save it", { description: errorMessage(err) })
      return false
    }
  }

  const askForDraft = async () => {
    if (dirty && !(await save())) return
    requestDraft.mutate(post.id, {
      onSuccess: ({ dispatched }) =>
        toast.success("Asked the promo agent for a draft", {
          description: dispatched
            ? "It usually lands within a minute. This page updates on its own."
            : "It picks this up on its next daily run (the API can't draft right now).",
        }),
      onError: (err) => toast.error("We couldn't ask for a draft", { description: errorMessage(err) }),
    })
  }

  const doApprove = () =>
    approve.mutate(post.id, {
      onSuccess: () => toast.success("Approved", { description: "Copy the text, download the pictures, post it, then mark it posted." }),
      onError: (err) => toast.error("We couldn't approve it", { description: errorMessage(err) }),
    })

  const info = POST_KIND_INFO[post.kind]
  const copy = form[editLang]
  const reachable = platformsFor(form.langs)
  const usual = POST_KIND_INFO[post.kind].platforms.filter((p) => reachable.includes(p))
  const going = postPlatforms({ kind: post.kind, platforms: form.platforms, langs: form.langs })
  const titleLimit = Math.min(
    ...going.filter((p) => POST_PLATFORM_INFO[p].langs.includes(editLang)).map((p) => POST_PLATFORM_INFO[p].titleLimit ?? Infinity),
  )
  const titleLength = [...copy.title.trim()].length
  const errorOf = (field: string) => issues[field]?.[0]
  const name = postLabel(post.kind, post.seq, form.label || post.label)

  return (
    <Page
      width="wide"
      header={
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex flex-col gap-3 border-b bg-background/95 px-4 pt-4 backdrop-blur sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-5">
          <PageHeader
            eyebrow={
              <span className="flex items-center gap-1.5">
                <Link to="/posts" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                  <ArrowLeftIcon className="size-3.5" /> Posts
                </Link>
                <span aria-hidden>/</span>
                {post.project ? (
                  <Link to="/projects/$projectId" params={{ projectId: post.project.id }} search={{ tab: "posts" }} className="hover:text-foreground hover:underline">
                    {post.project.title}
                  </Link>
                ) : (
                  "Novawerk"
                )}
              </span>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                {name}
                <span className="text-muted-foreground">{info.zh}</span>
                <StatusBadge kind="post" status={post.status} />
              </span>
            }
            description={[
              `Goes out ${formatDate(post.dueOn)}`,
              post.draftedAt && !repo ? `drafted ${formatRelative(post.draftedAt)}` : null,
              repo && post.approvedAt ? `approved in the repo ${formatRelative(post.approvedAt)}` : null,
              !repo && post.approvedAt ? `approved ${formatDateTime(post.approvedAt)}` : null,
              post.publishedAt ? `posted ${formatDateTime(post.publishedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                {dirty && (
                  <Button onClick={() => void save()} disabled={busy}>
                    <SaveIcon /> {update.isPending ? "Saving…" : "Save"}
                  </Button>
                )}
                {!closed &&
                  !repo &&
                  (post.content ? (
                    <ConfirmAction
                      trigger={
                        <Button variant="outline" disabled={busy || drafting}>
                          <SparklesIcon /> Redraft
                        </Button>
                      }
                      disabled={busy || drafting}
                      title="Ask for a new draft?"
                      description="The promo agent rewrites the post from the brief and our own data. The current text is replaced."
                      confirmLabel="Redraft"
                      onConfirm={() => void askForDraft()}
                    />
                  ) : (
                    <Button variant="outline" disabled={busy || drafting} onClick={() => void askForDraft()}>
                      <SparklesIcon /> Draft with AI
                    </Button>
                  ))}
                {post.status === "drafted" && (
                  <Button onClick={doApprove} disabled={busy || dirty || drafting || gaps.length > 0 || unwritten.length > 0}>
                    <CheckIcon /> Approve
                  </Button>
                )}
                {post.status === "approved" && (
                  <Button
                    onClick={() =>
                      publish.mutate(post.id, {
                        onSuccess: () => toast.success("Marked as posted"),
                        onError: (err) => toast.error("We couldn't save that", { description: errorMessage(err) }),
                      })
                    }
                    disabled={busy || dirty}
                  >
                    <SendIcon /> Mark as posted
                  </Button>
                )}
                {post.status === "published" && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      unpublish.mutate(post.id, {
                        onError: (err) => toast.error("We couldn't save that", { description: errorMessage(err) }),
                      })
                    }
                    disabled={busy}
                  >
                    <Undo2Icon /> Not posted yet
                  </Button>
                )}
                {post.status === "skipped" ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      restore.mutate(post.id, { onError: (err) => toast.error("We couldn't restore it", { description: errorMessage(err) }) })
                    }
                  >
                    <RotateCcwIcon /> Restore
                  </Button>
                ) : (
                  !closed && (
                    <ConfirmAction
                      trigger={
                        <Button variant="ghost" disabled={busy}>
                          <EyeOffIcon /> Skip
                        </Button>
                      }
                      disabled={busy}
                      title="Skip this post?"
                      description="It stays on the board as skipped and isn't planned again. You can restore it."
                      confirmLabel="Skip"
                      onConfirm={() =>
                        skip.mutate(post.id, { onError: (err) => toast.error("We couldn't skip it", { description: errorMessage(err) }) })
                      }
                    />
                  )
                )}
                {!repo && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More" />}>
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuItem onClick={() => setExporting(true)}>
                        <FolderGit2Icon /> Continue in the repo…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            }
          />
          <ViewSwitch value={view} onChange={setView} />
        </div>
      }
    >
      {exporting && <ExportDialog post={post} onClose={() => setExporting(false)} />}
      <Notices post={post} unwritten={unwritten} blank={blank} />

      {view === "preview" && (
        <div role="tabpanel" id="post-view-preview" className="mx-auto w-full max-w-3xl">
          <PostPreview post={post} form={form} lang={editLang} onLangChange={setLang} />
        </div>
      )}
      {/* Kept mounted while hidden: the form keeps its scroll and focus. */}
      <div role="tabpanel" id="post-view-content" hidden={view !== "content"} className="mx-auto w-full max-w-3xl">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>What and where</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className={cn("grid gap-4", post.kind === "custom" && "sm:grid-cols-[minmax(0,1fr)_170px]")}>
                  {post.kind === "custom" && (
                    <FormField label="Name" htmlFor="post-label" error={errorOf("label")} hint="What it is, for the board.">
                      <Input id="post-label" value={form.label} onChange={(e) => set("label", e.target.value)} disabled={!editable} maxLength={80} />
                    </FormField>
                  )}
                  <FormField label="Goes out on" htmlFor="post-due" error={errorOf("dueOn")} className={cn(post.kind !== "custom" && "sm:max-w-[170px]")}>
                    <Input id="post-due" type="date" value={form.dueOn} onChange={(e) => e.target.value && set("dueOn", e.target.value)} disabled={!editable} />
                  </FormField>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Languages</Label>
                  <ToggleChips
                    label="Languages"
                    options={POST_LANGS}
                    value={form.langs}
                    disabled={!editable}
                    onChange={(next) => next.length && set("langs", next)}
                    render={(l) => LANG_LABEL[l]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label>Platforms</Label>
                    {form.platforms && editable && (
                      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => set("platforms", null)}>
                        Use the usual ones for {info.label.toLowerCase()}
                      </button>
                    )}
                  </div>
                  <ToggleChips
                    label="Platforms"
                    options={POST_PLATFORMS}
                    value={form.platforms ?? usual}
                    disabled={!editable}
                    isDisabled={(p) => !reachable.includes(p)}
                    onChange={(next) => next.length && set("platforms", next)}
                    render={(p) => (
                      <>
                        <PlatformMark platform={p} />
                        {POST_PLATFORM_INFO[p].label}
                      </>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>The post</CardTitle>
                  <CardDescription>
                    {form.langs.length > 1 ? "Two native versions, not translations. " : ""}
                    For {going.map((p) => POST_PLATFORM_INFO[p].label).join(", ") || "no platform yet"}.
                  </CardDescription>
                </div>
                {form.langs.length > 1 && <LangSwitch langs={form.langs} value={editLang} onChange={setLang} />}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <FormField
                  label="Title"
                  htmlFor="post-title"
                  hint={
                    <span className={cn(titleLength > titleLimit && "text-warning")}>
                      {titleLength}
                      {Number.isFinite(titleLimit) ? `/${titleLimit} · Xiaohongshu cuts titles at ${titleLimit} characters` : " characters"}
                    </span>
                  }
                >
                  <Input id="post-title" value={copy.title} onChange={(e) => setCopy("title", e.target.value)} disabled={!editable} />
                </FormField>
                <FormField label="Text" htmlFor="post-body" hint={`${[...copy.body.trim()].length} characters. The preview shows each platform's limit.`}>
                  <Textarea
                    id="post-body"
                    value={copy.body}
                    onChange={(e) => setCopy("body", e.target.value)}
                    disabled={!editable}
                    className="min-h-64 text-[13px] leading-relaxed"
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>Pictures</CardTitle>
                  <CardDescription>The template card first, then the post's own pictures, in this order.</CardDescription>
                </div>
                {form.withCard && form.langs.length > 1 && <LangSwitch langs={form.langs} value={editLang} onChange={setLang} />}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SwitchRow
                  label="Template card"
                  description="Black, our serif squeezed tall, a HUD in green, with the words below. Assembled, never generated."
                  htmlFor="post-with-card"
                >
                  <Switch id="post-with-card" checked={form.withCard} onCheckedChange={(v) => set("withCard", v)} disabled={!editable} />
                </SwitchRow>

                {form.withCard && (
                  <fieldset className="flex flex-col gap-3 rounded-lg border p-4" disabled={!editable}>
                    <legend className="px-1 text-xs font-medium text-muted-foreground">On the card · {LANG_LABEL[editLang]}</legend>
                    <FormField label="Small line on top" htmlFor="card-eyebrow">
                      <Input id="card-eyebrow" value={copy.card.eyebrow} onChange={(e) => setCard("eyebrow", e.target.value)} />
                    </FormField>
                    <FormField label="Headline" htmlFor="card-headline" hint="Press Enter to choose where it breaks on the card.">
                      <Textarea
                        id="card-headline"
                        value={copy.card.headline}
                        onChange={(e) => setCard("headline", e.target.value)}
                        rows={2}
                        className="min-h-0 resize-none font-semibold"
                      />
                    </FormField>
                    <FormField label="Lede" htmlFor="card-lede" hint="One or two short sentences.">
                      <Textarea id="card-lede" value={copy.card.lede} onChange={(e) => setCard("lede", e.target.value)} className="min-h-16" />
                    </FormField>
                    <FormField label="Points" htmlFor="card-points" hint="One per line, up to 4 show.">
                      <Textarea id="card-points" value={copy.card.points} onChange={(e) => setCard("points", e.target.value)} className="min-h-20" />
                    </FormField>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                      <FormField label="Quote" htmlFor="card-quote" hint="Only real words someone said.">
                        <Textarea id="card-quote" value={copy.card.quoteText} onChange={(e) => setCard("quoteText", e.target.value)} className="min-h-16" />
                      </FormField>
                      <FormField label="Said by" htmlFor="card-quote-by">
                        <Input id="card-quote-by" value={copy.card.quoteBy} onChange={(e) => setCard("quoteBy", e.target.value)} />
                      </FormField>
                    </div>
                    <FormField label="Numbers" htmlFor="card-stats" hint="One per line: 1,240 | downloads. Only real ones.">
                      <Textarea
                        id="card-stats"
                        value={copy.card.stats}
                        onChange={(e) => setCard("stats", e.target.value)}
                        className="min-h-16 font-mono text-[13px]"
                      />
                    </FormField>
                    <FormField label="Footer" htmlFor="card-footer">
                      <Input id="card-footer" value={copy.card.footer} onChange={(e) => setCard("footer", e.target.value)} />
                    </FormField>
                    <CardPhoto post={post} form={form} onChange={(url) => set("photoUrl", url)} disabled={!editable} />
                  </fieldset>
                )}

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Its own pictures</p>
                  <PostPictures images={form.images} onChange={(images) => set("images", images)} langs={form.langs} project={post.project} disabled={!editable} />
                </div>
              </CardContent>
            </Card>
          </div>
      </div>
      {!repo && (
        <AgentRailContent title="Writer">
          <PostChat key={post.id} post={post} gaps={gaps} className="min-h-0 flex-1" />
        </AgentRailContent>
      )}
    </Page>
  )
}

function LangSwitch({ langs, value, onChange }: { langs: PostLang[]; value: PostLang; onChange: (lang: PostLang) => void }) {
  return (
    <div role="group" aria-label="Language" className="flex h-8 items-center rounded-lg border p-0.5 text-xs">
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={cn("h-full rounded-md px-3 text-muted-foreground", value === l && "bg-muted font-medium text-foreground")}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

/** The photo on the card: none, the project's cover or gallery, or one of the post's own pictures. */
function CardPhoto({ post, form, onChange, disabled }: { post: Post; form: PostForm; onChange: (url: string | null) => void; disabled?: boolean }) {
  const pictures = [
    ...(post.project?.coverUrl ? [post.project.coverUrl] : []),
    ...(post.project?.gallery.map((g) => g.url) ?? []),
    ...form.images.map((i) => i.url),
  ].filter((url, i, all) => all.indexOf(url) === i)
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-xs font-medium">Photo on the card</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className={cn(
            "flex size-12 items-center justify-center rounded-md border text-[11px] text-muted-foreground",
            form.photoUrl === null && "ring-2 ring-primary ring-offset-1",
          )}
        >
          None
        </button>
        {pictures.map((url) => {
          const drawable = isDrawable(url) || url.startsWith("http://localhost")
          return (
            <button
              key={url}
              type="button"
              disabled={disabled || !drawable}
              title={drawable ? undefined : "Cards take PNG, JPEG or GIF pictures"}
              onClick={() => onChange(url)}
              className={cn(
                "size-12 overflow-hidden rounded-md border disabled:cursor-not-allowed disabled:opacity-40",
                form.photoUrl === url && "ring-2 ring-primary ring-offset-1",
              )}
            >
              <img src={url} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {pictures.length
          ? "From the project and the post's own pictures. Screenshots and real photos beat anything generated."
          : "Add pictures to the post (below) or to the project to put one on the card."}
      </p>
    </div>
  )
}

/** "Continue in the repo": a command that writes this post into posts/ for Claude Code to work on. */
function ExportDialog({ post, onClose }: { post: Post; onClose: () => void }) {
  const [link, setLink] = React.useState<PostExportLink | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    dataSource.postExportLink(post.id).then(setLink, (err) => setError(errorMessage(err)))
  }, [post.id])
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Continue in the repo</DialogTitle>
          <DialogDescription>
            Run this in the novawerk repo. It writes the post into posts/ (text, card and pictures) so you can work on it
            with Claude Code or any other tool. When your pull request merges, this post is updated and approved.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : link ? (
          <div className="flex flex-col gap-2">
            <CopyLine text={link.command} />
            <p className="text-xs text-muted-foreground">The link works for 30 minutes, for this post only.</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" /> Making a link…
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Notices above the post. Its open points (placeholders) are listed in the writer's panel instead. */
type View = "preview" | "content"

/** Preview or Content, as tabs on the header's bottom edge. */
function ViewSwitch({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  const tabs = [
    { id: "preview", label: "Preview", icon: <EyeIcon /> },
    { id: "content", label: "Content", icon: <PencilIcon /> },
  ] as const
  return (
    <div role="tablist" aria-label="View" className="-mb-px flex gap-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          aria-controls={`post-view-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 border-b-2 border-transparent pb-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
            value === tab.id && "border-foreground font-medium text-foreground",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function Notices({ post, unwritten, blank }: { post: Post; unwritten: PostLang[]; blank: boolean }) {
  if (post.sourcePath) {
    return (
      <Notice tone="info" icon={<FolderGit2Icon />}>
        Written in the repo at <code className="rounded bg-info/10 px-1 font-mono text-[12px]">{post.sourcePath}</code>
        {post.sourceCommit ? ` (commit ${post.sourceCommit.slice(0, 7)})` : ""}. Change it there: the next merge brings the
        change here. Posting it and marking it posted happen here.{" "}
        <button
          type="button"
          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          onClick={() =>
            void navigator.clipboard.writeText(post.sourcePath!).then(
              () => toast.success("Copied the folder"),
              () => toast.error("We couldn't reach the clipboard"),
            )
          }
        >
          <CopyIcon className="size-3" /> Copy the folder
        </button>
      </Notice>
    )
  }
  if (post.draftRequestedAt) {
    const slow = Date.now() - new Date(post.draftRequestedAt).getTime() > SLOW_DRAFT_MS
    return slow ? (
      <Notice tone="warning" icon={<TriangleAlertIcon />}>
        The promo agent hasn't answered for over ten minutes. Check its runs on the Agents page; its daily run picks
        this post up either way.
      </Notice>
    ) : (
      <Notice tone="info" icon={<LoaderCircleIcon className="animate-spin" />}>
        The promo agent is writing a draft. This page updates when it lands.
      </Notice>
    )
  }
  return (
    <>
      {post.draftError && post.status !== "published" && (
        <Notice tone="danger" icon={<CircleAlertIcon />}>
          The last draft failed: {post.draftError}
        </Notice>
      )}
      {unwritten.length > 0 && post.status !== "published" && (
        <Notice tone="warning" icon={<TriangleAlertIcon />}>
          The {unwritten.map((l) => LANG_LABEL[l]).join(" and ")} version has no title or text yet. Write it, or take the
          language off the post.
        </Notice>
      )}
      {blank && post.status === "planned" && !post.draftError && (
        <Notice tone="info" icon={<InfoIcon />}>
          No draft yet. Tell the writer on the right what this post is about, or write it yourself.
        </Notice>
      )}
    </>
  )
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "warning" | "info"
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-2 rounded-lg border px-4 py-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "danger" && "border-destructive/25 bg-destructive/10 text-destructive",
        tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
        tone === "info" && "border-info/25 bg-info/10 text-info",
      )}
    >
      {icon}
      <p>{children}</p>
    </div>
  )
}
