import { createFileRoute } from "@tanstack/react-router"

import { PageHeader } from "@nw/ui/compound/page-header"

import { TaskEditor } from "@/components/board/task-editor"
import { Page } from "@/components/page"

export const Route = createFileRoute("/_app/tasks/new")({
  component: NewTaskPage,
})

function NewTaskPage() {
  const navigate = Route.useNavigate()
  return (
    <Page
      header={
        <PageHeader
          eyebrow="Contributors · Tasks"
          title="New task"
          description="Small enough to finish alone, with done-when lines a reviewer can check. Save a draft, or publish it to novawerk.io/tasks."
        />
      }
    >
      <TaskEditor onCreated={(task) => void navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })} />
    </Page>
  )
}
