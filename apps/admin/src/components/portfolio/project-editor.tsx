import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useBlocker, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, ImageOffIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  INITIATOR_ROLE,
  PROJECT_STATUSES,
  PUBLIC_PROJECT_STATUSES,
  projectInput,
  toHandle,
  type ProjectInput,
  type ProjectStatus,
} from "@nw/contracts"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Input } from "@nw/ui/core/components/ui/input"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { FileButton } from "@/components/file-button"
import { FormField, SwitchRow } from "@/components/form-field"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { StatusSelect } from "@/components/inbox/review-fields"
import { Page } from "@/components/page"
import { ProjectFiles } from "@/components/portfolio/project-files"
import { Deliverables, ProjectPosts, Timeline } from "@/components/portfolio/project-lifecycle"
import { SubmissionDetail } from "@/components/inbox/submission-detail"
import { TeamEditor, type TeamRow } from "@/components/portfolio/team-editor"
import { dataSource } from "@/lib/data-source"
import { errorMessage, issueFor, issuesFromParse, issuesOf } from "@/lib/errors"
import { websiteNote } from "@/lib/labels"
import {
  meQueryOptions,
  membersQueryOptions,
  useCreateProject,
  useDeleteProject,
  useSetProjectTeam,
  useUpdateProject,
} from "@/lib/queries"
import type { Project, WebsiteRefresh } from "@/lib/types"
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads"

const MarkdownPreview = React.lazy(() => import("./markdown-preview"))

type GalleryItem = { url: string; caption: string }

type Form = {
  title: string
  slug: string
  tagline: string
  description: string
  body: string
  status: ProjectStatus
  featured: boolean
  sortOrder: string
  year: string
  link: string
  coverUrl: string
  gallery: GalleryItem[]
  launchDate: string
}

const toForm = (p?: Project): Form => ({
  title: p?.title ?? "",
  slug: p?.slug ?? "",
  tagline: p?.tagline ?? "",
  description: p?.description ?? "",
  body: p?.body ?? "",
  status: p?.status ?? "draft",
  featured: p?.featured ?? false,
  sortOrder: String(p?.sortOrder ?? 100),
  year: p?.year != null ? String(p.year) : String(new Date().getFullYear()),
  link: p?.link ?? "",
  coverUrl: p?.coverUrl ?? "",
  gallery: (p?.gallery ?? []).map((g) => ({ url: g.url, caption: g.caption ?? "" })),
  launchDate: p?.launchDate ?? "",
})

/** Form strings → the API's input. Empty optional text becomes null (the schema does that). */
const toInput = (f: Form): ProjectInput => ({
  title: f.title,
  slug: f.slug,
  tagline: f.tagline,
  description: f.description,
  body: f.body,
  status: f.status,
  featured: f.featured,
  sortOrder: f.sortOrder.trim() === "" ? 100 : Number(f.sortOrder),
  year: f.year.trim() === "" ? null : Number(f.year),
  link: f.link,
  coverUrl: f.coverUrl,
  gallery: f.gallery.map((g) => (g.caption.trim() ? { url: g.url, caption: g.caption.trim() } : { url: g.url })),
  launchDate: f.launchDate || null,
})

/** What a member who isn't a maintainer sends: everything but the stage, featured, order and slug. */
function withoutAdminFields(input: ProjectInput): Partial<ProjectInput> {
  const { status: _s, featured: _f, sortOrder: _o, slug: _slug, ...rest } = input
  return rest
}

const toTeam = (p?: Project): TeamRow[] => (p?.team ?? []).map(({ memberId, role }) => ({ memberId, role }))

const isPublic = (status: ProjectStatus) => (PUBLIC_PROJECT_STATUSES as readonly string[]).includes(status)

/** The tabs of a project page: the website card and team, then the rest of its life. */
export const PROJECT_TABS = ["overview", "pitch", "deliverables", "posts", "files", "timeline"] as const
export type ProjectTab = (typeof PROJECT_TABS)[number]

const TAB_LABELS: Record<ProjectTab, string> = {
  overview: "Overview",
  pitch: "Pitch",
  deliverables: "Deliverables",
  posts: "Posts",
  files: "Files",
  timeline: "Timeline",
}

/**
 * Create (no `project`) or run a project: its website card, story and team (Overview), the pitch
 * it came from, its deliverables, its posts and its timeline.
 */
export function ProjectEditor({ project, initialTab = "overview" }: { project?: Project; initialTab?: ProjectTab }) {
  const navigate = useNavigate()
  const { data: members = [] } = useQuery(membersQueryOptions)
  const { data: me } = useQuery(meQueryOptions)
  const create = useCreateProject()
  const update = useUpdateProject()
  const saveTeam = useSetProjectTeam()
  const remove = useDeleteProject()

  // What the server has. The form compares against it to know what changed.
  const [saved, setSaved] = React.useState(project)
  const [form, setForm] = React.useState(() => toForm(project))
  const [team, setTeam] = React.useState(() => toTeam(project))
  const [slugTouched, setSlugTouched] = React.useState(Boolean(project))
  const [issues, setIssues] = React.useState<Record<string, string[]>>({})
  const [bodyTab, setBodyTab] = React.useState<"write" | "preview">("write")
  // Kept out of the URL: switching tabs mustn't trip the unsaved-changes guard.
  const [tab, setTab] = React.useState<ProjectTab>(initialTab)
  const leaving = React.useRef(false)

  // Admins run everything. Other members edit their own project's content; only its Initiator
  // changes the team; the stage, featured, order and slug stay with admins (the API checks too).
  const isAdmin = me?.role === "maintainer"
  const isInitiator = Boolean(saved?.team.some((t) => t.memberId === me?.id && t.role.toLowerCase() === INITIATOR_ROLE.toLowerCase()))
  const canEditTeam = isAdmin || isInitiator

  const formDirty = JSON.stringify(form) !== JSON.stringify(toForm(saved))
  const teamDirty = JSON.stringify(team) !== JSON.stringify(toTeam(saved))
  const dirty = formDirty || teamDirty
  const saving = create.isPending || update.isPending || saveTeam.isPending

  useBlocker({
    shouldBlockFn: () => dirty && !leaving.current && !window.confirm("Leave without saving? Your changes are lost."),
    enableBeforeUnload: () => dirty && !leaving.current,
  })

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    // An edited field loses its old error; the next save checks it again.
    setIssues((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  const errorOf = (key: string) => issues[key]?.[0]

  // Pictures upload as soon as they are picked; Save stores their URLs with the project.
  const [uploading, setUploading] = React.useState<string | null>(null)
  const upload = async (files: File[], onDone: (url: string) => void) => {
    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `${i + 1} of ${files.length}` : file.name
      setUploading(`Uploading ${label}…`)
      try {
        onDone(await uploadImage(file, (pct) => setUploading(`Uploading ${label}… ${Math.round(pct)}%`)))
      } catch (err) {
        toast.error("We couldn't upload that picture", { description: errorMessage(err) })
      }
    }
    setUploading(null)
  }
  const uploadsOff = dataSource.isSample

  const report = (website: WebsiteRefresh | undefined, status: ProjectStatus, title: string) => {
    if (!isPublic(status)) return toast.success(title, { description: "It stays off the website while it's a draft or archived." })
    const note = website ? websiteNote(website) : undefined
    return note?.tone === "warning"
      ? toast.warning(title, { description: note.text })
      : toast.success(title, { description: note?.text })
  }

  const save = async () => {
    const parsed = projectInput.safeParse(toInput(form))
    if (!parsed.success) {
      setIssues(issuesFromParse(parsed.error))
      toast.error("Check the fields marked in red")
      return
    }
    setIssues({})

    let current = saved
    let website: WebsiteRefresh | undefined
    let postsPlanned = 0
    try {
      if (!current) {
        const result = await create.mutateAsync(toInput(form))
        current = result.project
        website = result.website
        postsPlanned = result.postsPlanned
      } else if (formDirty) {
        const result = await update.mutateAsync({ id: current.id, patch: isAdmin ? toInput(form) : withoutAdminFields(toInput(form)) })
        current = result.project
        website = result.website
        postsPlanned = result.postsPlanned
      }
    } catch (err) {
      setIssues(issuesOf(err))
      if (Object.keys(issuesOf(err)).length) toast.error("Check the fields marked in red")
      else toast.error("We couldn't save it", { description: errorMessage(err) })
      return
    }

    if (teamDirty || (!saved && team.length)) {
      try {
        const result = await saveTeam.mutateAsync({ id: current.id, team })
        current = { ...current, team: result.team }
        website = result.website
      } catch (err) {
        toast.error("We saved the project, not the team", { description: errorMessage(err) })
      }
    }

    setSaved(current)
    setForm(toForm(current))
    setTeam(toTeam(current))
    report(website, current.status, project ? "Saved" : "Project created")
    if (postsPlanned > 0) {
      toast.info(postsPlanned === 1 ? "A new post is planned" : `${postsPlanned} new posts are planned`, {
        description: "The promo agent drafts it in Chinese and English. Review it under Posts.",
        action: { label: "Open Posts", onClick: () => void navigate({ to: "/posts" }) },
      })
    }
    if (!project) {
      leaving.current = true
      void navigate({ to: "/projects/$projectId", params: { projectId: current.id }, replace: true })
    }
  }

  const onDelete = () => {
    if (!saved) return
    remove.mutate(saved.id, {
      onSuccess: ({ website }) => {
        leaving.current = true
        report(website, isPublic(saved.status) ? saved.status : "draft", `Deleted ${saved.title}`)
        void navigate({ to: "/projects" })
      },
      onError: (err) => toast.error("We couldn't delete it", { description: errorMessage(err) }),
    })
  }

  const heading = {
    eyebrow: "Project",
    title: (
      <span className="flex flex-wrap items-center gap-3">
        {form.title.trim() || (project ? "Untitled project" : "New project")}
        {saved && <StatusBadge kind="project" status={saved.status} />}
      </span>
    ),
    description: isPublic(form.status)
      ? "Public: it shows on novawerk.io once you save."
      : "Not public: drafts and archived projects stay off the website.",
  }
  const saveControls = (
    <>
      {dirty && (
        <span className="text-xs text-muted-foreground">
          Unsaved<span className="hidden sm:inline"> changes</span>
        </span>
      )}
      <Button onClick={() => void save()} disabled={saving || Boolean(uploading) || (!dirty && Boolean(project))}>
        <SaveIcon /> {saving ? "Saving…" : project ? "Save" : "Create project"}
      </Button>
    </>
  )
  const tabs = saved && (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ProjectTab)} className="max-w-full overflow-x-auto">
      <TabsList>
        {PROJECT_TABS.filter((t) => t !== "pitch" || (saved.submissionId && isAdmin)).map((t) => (
          <TabsTrigger key={t} value={t}>
            {TAB_LABELS[t]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  return (
    <Page
      width="wide"
      header={
        <>
          {/* Sticky, so Save and the tabs stay in reach on a long form. On a phone only the back
              link and Save stick; the title and the tabs scroll away with the form. */}
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b bg-background/95 px-4 pt-4 pb-3 backdrop-blur sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" className="-ml-2 w-fit" nativeButton={false} render={<Link to="/projects" />}>
                <ArrowLeftIcon /> Projects
              </Button>
              <div className="flex items-center gap-2 sm:hidden">{saveControls}</div>
            </div>
            <PageHeader {...heading} actions={saveControls} className="hidden sm:flex" />
            {tabs && <div className="hidden sm:block">{tabs}</div>}
          </div>
          <PageHeader {...heading} className="sm:hidden" />
          {tabs && <div className="sm:hidden">{tabs}</div>}
        </>
      }
    >
      {saved && tab === "pitch" && saved.submissionId && <SubmissionDetail id={saved.submissionId} embedded />}
      {saved && tab === "deliverables" && <Deliverables projectId={saved.id} />}
      {saved && tab === "posts" && <ProjectPosts project={saved} />}
      {saved && tab === "files" && me && <ProjectFiles projectId={saved.id} me={me} canManage={canEditTeam} />}
      {saved && tab === "timeline" && <Timeline projectId={saved.id} />}
      <form
        hidden={tab !== "overview"}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>The card on the website</CardTitle>
              <CardDescription>What visitors see in the portfolio grid.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Title" htmlFor="project-title" error={errorOf("title")}>
                  <Input
                    id="project-title"
                    value={form.title}
                    onChange={(e) => {
                      set("title", e.target.value)
                      if (!slugTouched) set("slug", toHandle(e.target.value, 80))
                    }}
                    required
                  />
                </FormField>
                <FormField
                  label="Slug"
                  htmlFor="project-slug"
                  error={errorOf("slug")}
                  hint="Its name in links. Lowercase letters, digits, hyphens."
                >
                  <Input
                    id="project-slug"
                    disabled={Boolean(project) && !isAdmin}
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      set("slug", e.target.value)
                    }}
                    className="font-mono"
                    required
                  />
                </FormField>
              </div>
              <FormField label="Tagline" htmlFor="project-tagline" error={errorOf("tagline")} hint="One short line.">
                <Input id="project-tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
              </FormField>
              <FormField
                label="Description"
                htmlFor="project-description"
                error={errorOf("description")}
                hint={`One or two sentences for the card. ${form.description.length}/500`}
              >
                <Textarea
                  id="project-description"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="min-h-20"
                />
              </FormField>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Pictures</CardTitle>
              <CardDescription>
                The cover goes on the website card. Screenshots and photos can go on the posts too.
                {uploading ? ` ${uploading}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Cover</p>
                {form.coverUrl.startsWith("https://") ? (
                  <CoverPreview key={form.coverUrl} url={form.coverUrl} />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    No cover yet
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    id="project-cover"
                    aria-label="Cover image link"
                    type="url"
                    value={form.coverUrl}
                    onChange={(e) => set("coverUrl", e.target.value)}
                    placeholder="https://"
                    className="h-8 min-w-0 flex-1"
                  />
                  <FileButton
                    accept={IMAGE_ACCEPT}
                    disabled={Boolean(uploading) || uploadsOff}
                    title={uploadsOff ? "Uploads are off in sample mode" : undefined}
                    onFiles={(picked) => void upload(picked.slice(0, 1), (url) => set("coverUrl", url))}
                  >
                    Upload
                  </FileButton>
                </div>
                {errorOf("coverUrl") && (
                  <p role="alert" className="text-xs text-destructive">
                    {errorOf("coverUrl")}
                  </p>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-medium">
                  Gallery <span className="font-normal text-muted-foreground">{form.gallery.length}/24</span>
                </p>
                {form.gallery.length > 0 && (
                  <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {form.gallery.map((item, index) => (
                      <li key={item.url} className="group relative flex flex-col gap-1">
                        <img src={item.url} alt="" className="aspect-[4/3] w-full rounded-md border object-cover" />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon-sm"
                          aria-label={`Remove picture ${index + 1}`}
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => set("gallery", form.gallery.filter((_, i) => i !== index))}
                        >
                          <XIcon />
                        </Button>
                        <Input
                          aria-label={`Caption for picture ${index + 1}`}
                          value={item.caption}
                          placeholder="Caption"
                          className="h-7 text-xs"
                          onChange={(e) =>
                            set(
                              "gallery",
                              form.gallery.map((g, i) => (i === index ? { ...g, caption: e.target.value } : g)),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {errorOf("gallery") && (
                  <p role="alert" className="text-xs text-destructive">
                    {errorOf("gallery")}
                  </p>
                )}
                <div>
                  <FileButton
                    accept={IMAGE_ACCEPT}
                    multiple
                    disabled={Boolean(uploading) || uploadsOff || form.gallery.length >= 24}
                    title={uploadsOff ? "Uploads are off in sample mode" : undefined}
                    onFiles={(picked) =>
                      void upload(picked.slice(0, 24 - form.gallery.length), (url) =>
                        setForm((f) => ({ ...f, gallery: [...f.gallery, { url, caption: "" }] })),
                      )
                    }
                  >
                    Add pictures
                  </FileButton>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <CardTitle>The story</CardTitle>
                <CardDescription>Markdown. For a project page later; not shown yet.</CardDescription>
              </div>
              <Tabs value={bodyTab} onValueChange={(v) => setBodyTab(v as "write" | "preview")}>
                <TabsList>
                  <TabsTrigger value="write">Write</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {bodyTab === "write" ? (
                <FormField label={<span className="sr-only">Body</span>} htmlFor="project-body" error={errorOf("body")}>
                  <Textarea
                    id="project-body"
                    value={form.body}
                    onChange={(e) => set("body", e.target.value)}
                    className="min-h-56 font-mono text-[13px]"
                    placeholder={"## Why we build it\n\nWho it's for, what it does, what's next."}
                  />
                </FormField>
              ) : (
                <div className="min-h-56 rounded-md border px-4 py-3">
                  {form.body.trim() ? (
                    <React.Suspense fallback={<p className="text-sm text-muted-foreground">Loading preview…</p>}>
                      <MarkdownPreview markdown={form.body} />
                    </React.Suspense>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Stage</CardTitle>
              <CardDescription>
                {isAdmin ? "Moving it on plans the posts for that stage." : "An admin moves the project to its next stage."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusSelect
                id="project-status"
                kind="project"
                statuses={PROJECT_STATUSES}
                value={form.status}
                onChange={(status) => set("status", status)}
                disabled={!isAdmin}
              />
              <FormField
                label="Launch date"
                htmlFor="project-launch-date"
                error={errorOf("launchDate")}
                hint="Set it when launching. T+10, T+30 and T+90 count from it."
              >
                <Input
                  id="project-launch-date"
                  type="date"
                  value={form.launchDate}
                  onChange={(e) => set("launchDate", e.target.value)}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>
                {canEditTeam ? "Who works on it. The role is free text." : "Who works on it. The Initiator changes the team."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canEditTeam ? (
                <TeamEditor members={members} value={team} onChange={setTeam} error={issueFor(saveTeam.error, "members")} />
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {(saved?.team ?? []).map((t) => (
                    <li key={t.memberId} className="flex justify-between gap-3">
                      <span className="font-medium">{t.displayName}</span>
                      <span className="text-muted-foreground">{t.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>On the website</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Project link" htmlFor="project-link" error={errorOf("link")}>
                <Input
                  id="project-link"
                  type="url"
                  value={form.link}
                  onChange={(e) => set("link", e.target.value)}
                  placeholder="https://"
                />
              </FormField>
              {isAdmin && (
                <SwitchRow label="Featured" htmlFor="project-featured" description="Shows first on the website.">
                  <Switch
                    id="project-featured"
                    aria-label="Featured"
                    checked={form.featured}
                    onCheckedChange={(v) => set("featured", v)}
                  />
                </SwitchRow>
              )}
              <div className="grid grid-cols-2 gap-3">
                {isAdmin && (
                  <FormField label="Order" htmlFor="project-order" error={errorOf("sortOrder")} hint="Lower comes first.">
                    <Input
                      id="project-order"
                      type="number"
                      min={0}
                      max={10000}
                      value={form.sortOrder}
                      onChange={(e) => set("sortOrder", e.target.value)}
                    />
                  </FormField>
                )}
                <FormField label="Year" htmlFor="project-year" error={errorOf("year")}>
                  <Input
                    id="project-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(e) => set("year", e.target.value)}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {saved && isAdmin && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                To keep the record, set it to Archived instead of deleting it.
              </p>
              <ConfirmAction
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive" disabled={remove.isPending}>
                    <Trash2Icon /> Delete
                  </Button>
                }
                disabled={remove.isPending}
                variant="destructive"
                title={`Delete ${saved.title}?`}
                description="It disappears from the website and its team, deliverables and posts go with it. This can't be undone. The pitch it came from stays."
                confirmLabel="Delete"
                onConfirm={onDelete}
              />
            </div>
          )}
        </aside>
      </form>
    </Page>
  )
}

function CoverPreview({ url }: { url: string }) {
  const [broken, setBroken] = React.useState(false)
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted">
      {broken ? (
        <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <ImageOffIcon className="size-5" />
          We can't load this image
        </span>
      ) : (
        <img src={url} alt="Cover preview" className="size-full object-cover" onError={() => setBroken(true)} />
      )}
    </div>
  )
}
