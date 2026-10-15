// Write or edit a task: what and why, done-when lines, size, area, skills, the repository, the
// reviewer and the contribution guide. New tasks save as a draft or publish at once.

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import type { TaskArea, TaskSize } from "@nw/contracts"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Input } from "@nw/ui/core/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { AreaSelect, CriteriaEditor, SizeControl, cleanLines } from "@/components/board/parts"
import { FormField } from "@/components/form-field"
import { MemberSelect } from "@/components/inbox/review-fields"
import { useCreateTask, useUpdateTask } from "@/lib/board-queries"
import { errorMessage, issueFor } from "@/lib/errors"
import { membersQueryOptions } from "@/lib/queries"
import type { AdminTaskDetail } from "@/lib/types"

const MarkdownPreview = React.lazy(() => import("@/components/portfolio/markdown-preview"))

export const DEFAULT_GUIDE = `## Get the code
Fork Novawerk/novawerk-workspace, then \`pnpm install\` and \`pnpm db:up && pnpm db:migrate && pnpm db:seed:dev\`.

## Our rules
- Change a table: edit \`packages/db/src/schema.ts\`, run \`pnpm db:generate\`.
- Validate input with \`@nw/contracts\` in the browser and in the API.
- In shared packages only \`packages/config\` reads \`process.env\`.

## Open the pull request
Put \`Task: NW-<n>\` in its body. Sign off every commit (\`git commit -s\`).
Run \`pnpm typecheck && pnpm test && pnpm lint\` first.

## Task notes
`

type Form = {
  title: string
  summary: string
  body: string
  criteria: string[]
  area: TaskArea | null
  size: TaskSize | null
  skills: string
  repo: string
  reviewerId: string | null
  guideTemplate: string
}

const formOf = (task?: AdminTaskDetail): Form => ({
  title: task?.title ?? "",
  summary: task?.summary ?? "",
  body: task?.body ?? "",
  criteria: task?.criteria ?? [],
  area: task?.area ?? null,
  size: task?.size ?? null,
  skills: task?.skills.join(", ") ?? "",
  repo: task?.repo ?? "Novawerk/novawerk-workspace",
  reviewerId: task?.reviewerId ?? null,
  guideTemplate: task?.guideTemplate ?? (task ? "" : DEFAULT_GUIDE),
})

const skillsOf = (text: string) => [...new Set(text.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))]

export function TaskEditor({
  task,
  readOnly,
  onCreated,
}: {
  task?: AdminTaskDetail
  /** Finished tasks: shown, not editable. */
  readOnly?: boolean
  onCreated?: (task: AdminTaskDetail) => void
}) {
  const { data: members = [] } = useQuery(membersQueryOptions)
  const create = useCreateTask()
  const update = useUpdateTask()
  const [form, setForm] = React.useState<Form>(() => formOf(task))
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const error = create.error ?? update.error
  const pending = create.isPending || update.isPending
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(task))

  const fields = () => ({
    title: form.title,
    summary: form.summary,
    body: form.body,
    criteria: cleanLines(form.criteria),
    skills: skillsOf(form.skills),
    repo: form.repo,
    reviewerId: form.reviewerId,
    guideTemplate: form.guideTemplate,
  })

  const save = (publish: boolean) => {
    if (task) {
      update.mutate(
        { id: task.id, patch: { ...fields(), ...(form.area ? { area: form.area } : {}), ...(form.size ? { size: form.size } : {}) } },
        {
          onSuccess: (saved) => {
            setForm(formOf(saved))
            toast.success(`Saved ${task.id}`)
          },
          onError: (err) => toast.error("We couldn't save it", { description: errorMessage(err) }),
        },
      )
      return
    }
    if (!form.area || !form.size) {
      toast.error("Pick an area and a size first")
      return
    }
    create.mutate(
      { ...fields(), area: form.area, size: form.size, publish },
      {
        onSuccess: (created) => {
          toast.success(publish ? `${created.id} is on the board` : `${created.id} saved as a draft`)
          onCreated?.(created)
        },
        onError: (err) => toast.error("We couldn't save it", { description: errorMessage(err) }),
      },
    )
  }

  const isSuggestion = task?.kind !== undefined && task.kind !== "task"

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
    >
      <fieldset disabled={readOnly} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>The task</CardTitle>
            <CardDescription>
              {isSuggestion ? "What the contributor suggested. Tidy it up if it helps." : "What a contributor reads on novawerk.io/tasks."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Title" htmlFor="task-title" error={issueFor(error, "title")}>
              <Input id="task-title" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!task} />
            </FormField>
            <FormField label="Summary" htmlFor="task-summary" error={issueFor(error, "summary")} hint="One line under the title on the board.">
              <Input id="task-summary" value={form.summary} onChange={(e) => set("summary", e.target.value)} />
            </FormField>
            <MarkdownField
              id="task-body"
              label="What and why"
              hint="Markdown. What to change, why it matters, where to start."
              value={form.body}
              onChange={(v) => set("body", v)}
              error={issueFor(error, "body")}
              rows={8}
            />
            <CriteriaEditor id="task-criteria" value={form.criteria} onChange={(v) => set("criteria", v)} error={issueFor(error, "criteria")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Size and details</CardTitle>
            <CardDescription>Size sets the Werk. Werk is recognition only, never money or rank.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SizeControl id="task-size" value={form.size} onChange={(v) => set("size", v)} error={issueFor(error, "size")} />
            <AreaSelect id="task-area" value={form.area} onChange={(v) => set("area", v)} error={issueFor(error, "area")} />
            <FormField label="Skills" htmlFor="task-skills" error={issueFor(error, "skills")} hint="Comma-separated, e.g. react, tailwind.">
              <Input id="task-skills" value={form.skills} onChange={(e) => set("skills", e.target.value)} />
            </FormField>
            <FormField label="Repository" htmlFor="task-repo" error={issueFor(error, "repo")} hint="owner/name on GitHub." className="sm:col-span-2">
              <Input id="task-repo" value={form.repo} onChange={(e) => set("repo", e.target.value)} className="font-mono" />
            </FormField>
            <MemberSelect
              id="task-reviewer"
              label="Reviewer"
              members={members}
              value={form.reviewerId}
              onChange={(v) => set("reviewerId", v)}
              emptyLabel="Nobody yet"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contribution guide</CardTitle>
            <CardDescription>The assignee sees this once they have the task. Start from the template; add task notes at the end.</CardDescription>
          </CardHeader>
          <CardContent>
            <MarkdownField
              id="task-guide"
              label="Guide"
              value={form.guideTemplate}
              onChange={(v) => set("guideTemplate", v)}
              error={issueFor(error, "guideTemplate")}
              rows={10}
              action={
                !form.guideTemplate.trim() && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set("guideTemplate", DEFAULT_GUIDE)}>
                    Use the template
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      </fieldset>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          {task ? (
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          ) : (
            <>
              <Button type="submit" variant="outline" disabled={pending}>
                Save draft
              </Button>
              <Button type="button" disabled={pending} onClick={() => save(true)}>
                Publish
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  )
}

function MarkdownField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  rows,
  action,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  error?: string
  rows: number
  action?: React.ReactNode
}) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint}>
      <Tabs defaultValue="write">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          {action}
        </div>
        <TabsContent value="write">
          <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="font-mono text-sm" />
        </TabsContent>
        <TabsContent value="preview" className="min-h-24 rounded-md border px-3 py-2">
          {value.trim() ? (
            <React.Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
              <MarkdownPreview markdown={value} />
            </React.Suspense>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </FormField>
  )
}
