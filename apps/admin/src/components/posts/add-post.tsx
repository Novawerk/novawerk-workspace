import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, CopyIcon, FolderGit2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  LIFECYCLE_POST_KINDS,
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORMS,
  POST_PLATFORM_INFO,
  postLabel,
  type PostKind,
  type PostLang,
  type PostPlatform,
} from "@nw/contracts"
import { Button } from "@nw/ui/core/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nw/ui/core/components/ui/dialog"
import { Input } from "@nw/ui/core/components/ui/input"
import { Label } from "@nw/ui/core/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@nw/ui/core/components/ui/select"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { cn } from "@nw/ui/lib/utils"

import { FormField, SwitchRow } from "@/components/form-field"
import { errorMessage, issueFor } from "@/lib/errors"
import { todayIso } from "@/lib/format"
import { meQueryOptions, projectsQueryOptions, useCreatePost } from "@/lib/queries"

import { LANG_LABEL, PlatformMark } from "./post-meta"

/** The value of "no project" in the project picker. */
const NOVAWERK = "novawerk"

/** Toggle chips: pick one or more. */
export function ToggleChips<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  render,
  isDisabled,
}: {
  options: readonly T[]
  value: readonly T[]
  onChange: (next: T[]) => void
  label: string
  disabled?: boolean
  render: (option: T) => React.ReactNode
  isDisabled?: (option: T) => boolean
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value.includes(option)
        const off = disabled || isDisabled?.(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            disabled={off}
            onClick={() => onChange(on ? value.filter((v) => v !== option) : options.filter((o) => o === option || value.includes(o)))}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {on && <CheckIcon className="size-3" />}
            {render(option)}
          </button>
        )
      })}
    </div>
  )
}

/** Platforms a set of languages can reach. */
export const platformsFor = (langs: readonly PostLang[]) =>
  POST_PLATFORMS.filter((p) => POST_PLATFORM_INFO[p].langs.some((l) => langs.includes(l)))

const KINDS: PostKind[] = ["custom", ...LIFECYCLE_POST_KINDS]

/** The folder `pnpm post new` makes: the date, then the project and the name, kebab-cased. */
function folderFor(date: string, ...words: (string | null | undefined)[]) {
  const tail = words
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "")
  return `posts/${tail ? `${date}-${tail}` : date}`
}

const quote = (s: string) => (/^[\w./:-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, "\\$1")}"`)

/** A command with a copy button. */
export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/50 py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 py-0.5 font-mono text-[12px] leading-relaxed break-all">{text}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            },
            () => toast.error("We couldn't reach the clipboard"),
          )
        }
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

/**
 * "New post": any kind, for a project or for Novawerk itself, in one or both languages, for the
 * platforms you pick. Write it here, or (second tab) in the repo with Claude Code.
 */
export function NewPostDialog({
  projectId: fixedProject,
  kind: startKind = "custom",
  onClose,
}: {
  projectId?: string
  /** Start from this template (Posts → Templates). */
  kind?: PostKind
  onClose: () => void
}) {
  const navigate = useNavigate()
  const create = useCreatePost()
  const { data: me } = useQuery(meQueryOptions)
  const { data: projects = [] } = useQuery(projectsQueryOptions)
  const options = projects.filter((p) => p.status !== "archived")
  const maintainer = me?.role === "maintainer"

  const [project, setProject] = React.useState<string | null>(fixedProject ?? (maintainer && startKind === "custom" ? NOVAWERK : null))
  const [kind, setKind] = React.useState<PostKind>(startKind)
  const [name, setName] = React.useState("")
  const [dueOn, setDueOn] = React.useState(todayIso())
  const [langs, setLangs] = React.useState<PostLang[]>(["zh", "en"])
  const [platforms, setPlatforms] = React.useState<PostPlatform[] | null>(null)
  const [withCard, setWithCard] = React.useState(true)
  const [draft, setDraft] = React.useState(true)
  const [mode, setMode] = React.useState<"here" | "repo">("here")

  const projectId = project && project !== NOVAWERK ? project : null
  const slug = options.find((p) => p.id === projectId)?.slug ?? null
  const reachable = platformsFor(langs)
  const usual = POST_KIND_INFO[kind].platforms.filter((p) => reachable.includes(p))
  const chosen = (platforms ?? usual).filter((p) => reachable.includes(p))
  const lifecycle = kind !== "custom"
  const ready = project !== null && (!lifecycle || projectId) && (!lifecycle ? name.trim() : true) && langs.length > 0 && chosen.length > 0

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready || mode !== "here") return
    create.mutate(
      {
        projectId,
        kind,
        ...(kind === "custom" ? { label: name.trim() } : {}),
        dueOn,
        langs,
        platforms: platforms ? chosen : null,
        withCard,
        draft,
      },
      {
        onSuccess: ({ post, dispatched }) => {
          toast.success(`${postLabel(post.kind, post.seq, post.label)} added`, {
            description: !draft
              ? "Write it on the next page."
              : dispatched
                ? "The promo agent is writing a draft."
                : "Write it yourself, or the promo agent drafts it on its next daily run.",
          })
          onClose()
          void navigate({ to: "/posts/$postId", params: { postId: post.id } })
        },
        onError: (err) => toast.error("We couldn't add it", { description: errorMessage(err) }),
      },
    )
  }

  const folder = folderFor(dueOn, slug, kind === "custom" ? name.trim() || "post" : kind)
  const command = [
    "pnpm post new",
    ...(slug ? [`--project ${slug}`] : []),
    ...(kind !== "custom" ? [`--kind ${kind}`] : [`--name ${quote(name.trim() || "Open day")}`]),
    `--date ${dueOn}`,
    ...(langs.length === 1 ? [`--langs ${langs[0]}`] : []),
    ...(platforms && chosen.join() !== usual.join() ? [`--platforms ${chosen.join(",")}`] : []),
    ...(withCard ? [] : ["--no-card"]),
  ].join(" ")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>New post</DialogTitle>
            <DialogDescription>
              Lifecycle posts appear on their own from a project's stage and launch date. Add anything else here: an
              open day, a call for builders, a thank-you.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-post-project">For</Label>
                <Select
                  items={[
                    ...(maintainer ? [{ value: NOVAWERK, label: "Novawerk itself (no project)" }] : []),
                    ...options.map((p) => ({ value: p.id, label: p.title })),
                  ]}
                  value={project}
                  onValueChange={(v) => {
                    setProject(v ? String(v) : null)
                    if (v === NOVAWERK) setKind("custom")
                  }}
                  disabled={Boolean(fixedProject)}
                >
                  <SelectTrigger id="new-post-project" className="w-full">
                    <SelectValue placeholder="Pick a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {maintainer && <SelectItem value={NOVAWERK}>Novawerk itself (no project)</SelectItem>}
                    {options.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField label="Goes out on" htmlFor="new-post-due">
                <Input id="new-post-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} required />
              </FormField>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {KINDS.map((k) => {
                  const off = k !== "custom" && !projectId
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      disabled={off}
                      title={off ? "Lifecycle posts belong to a project" : undefined}
                      onClick={() => {
                        setKind(k)
                        setPlatforms(null)
                      }}
                      className={cn(
                        "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        kind === k ? "border-primary bg-primary/10" : "hover:border-foreground/30",
                        k === "custom" && "sm:col-span-1",
                      )}
                    >
                      <span className="text-xs font-medium">{POST_KIND_INFO[k].zh}</span>
                      <span className="text-[11px] text-muted-foreground">{k === "custom" ? "Anything else" : POST_KIND_INFO[k].label}</span>
                    </button>
                  )
                })}
              </div>
              {issueFor(create.error, "kind") && <p className="text-xs text-destructive">{issueFor(create.error, "kind")}</p>}
            </div>

            {kind === "custom" && (
              <FormField label="Name" htmlFor="new-post-name" hint="What it is, for the board: Open day, Call for builders, Thanks to our partners…" error={issueFor(create.error, "label")}>
                <Input id="new-post-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Open day" maxLength={80} autoFocus />
              </FormField>
            )}

            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex flex-col gap-1.5">
                <Label>Languages</Label>
                <ToggleChips
                  label="Languages"
                  options={POST_LANGS}
                  value={langs}
                  onChange={(next) => next.length && setLangs(next)}
                  render={(l) => LANG_LABEL[l]}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Platforms</Label>
                <ToggleChips
                  label="Platforms"
                  options={POST_PLATFORMS}
                  value={chosen}
                  onChange={(next) => setPlatforms(next)}
                  isDisabled={(p) => !reachable.includes(p)}
                  render={(p) => (
                    <>
                      <PlatformMark platform={p} />
                      {POST_PLATFORM_INFO[p].label}
                    </>
                  )}
                />
              </div>
            </div>

            <SwitchRow
              label="Template card"
              description="The Novawerk card with the post's headline goes first. Off: only your own pictures, or none."
              htmlFor="new-post-card"
            >
              <Switch id="new-post-card" checked={withCard} onCheckedChange={setWithCard} />
            </SwitchRow>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "here" | "repo")}>
              <TabsList className="w-full">
                <TabsTrigger value="here">Write it here</TabsTrigger>
                <TabsTrigger value="repo">
                  <FolderGit2Icon /> In the repo, with Claude
                </TabsTrigger>
              </TabsList>
              <TabsContent value="here" className="pt-3">
                <SwitchRow
                  label="Ask the promo agent for a first draft"
                  description="It writes from the project's data and your brief, and marks what's missing. Off: you write it yourself."
                  htmlFor="new-post-draft"
                >
                  <Switch id="new-post-draft" checked={draft} onCheckedChange={setDraft} />
                </SwitchRow>
              </TabsContent>
              <TabsContent value="repo" className="flex flex-col gap-2 pt-3 text-sm">
                <p className="text-muted-foreground">
                  Write it in your editor with Claude Code or any AI you like. The folder is the source: merging the pull
                  request brings the post here, approved.
                </p>
                <ol className="flex list-decimal flex-col gap-2 pl-5 marker:text-muted-foreground">
                  <li>
                    Make the folder:
                    <CopyLine text={command} />
                  </li>
                  <li>
                    Ask Claude Code to write it (the <code className="text-xs">nw-posts</code> skill knows the format and
                    our voice):
                    <CopyLine text={`claude "Write the post in ${folder}: <what it's about, real facts, quotes, numbers>"`} />
                  </li>
                  <li>
                    Look at the card and check it:
                    <CopyLine text={`pnpm post render ${folder} && pnpm post check ${folder}`} />
                  </li>
                  <li>Open a pull request. When it merges, the post shows up here as approved.</li>
                </ol>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {mode === "repo" ? "Close" : "Cancel"}
            </Button>
            {mode === "here" && (
              <Button type="submit" disabled={!ready || create.isPending}>
                <PlusIcon /> {create.isPending ? "Adding…" : "Add post"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Add post" with the project already picked (the project page, a project's line on the board). */
export function AddPostButton({ projectId, children = "Add post", ...props }: { projectId?: string; children?: React.ReactNode } & Omit<React.ComponentProps<typeof Button>, "onClick" | "children">) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" {...props} onClick={() => setOpen(true)}>
        <PlusIcon /> {children}
      </Button>
      {open && <NewPostDialog projectId={projectId} onClose={() => setOpen(false)} />}
    </>
  )
}
