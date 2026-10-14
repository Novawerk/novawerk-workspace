import { useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { LayoutGridIcon } from "lucide-react"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { Button } from "@nw/ui/core/components/ui/button"

import { PROJECT_TABS, ProjectEditor, type ProjectTab } from "@/components/portfolio/project-editor"
import { membersQueryOptions, projectQueryOptions } from "@/lib/queries"

type Search = { tab?: ProjectTab }

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    tab: PROJECT_TABS.find((t) => t === search.tab),
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(membersQueryOptions),
    ]),
  component: ProjectPage,
  errorComponent: MissingProject,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  const { tab } = Route.useSearch()
  const { data: project } = useSuspenseQuery(projectQueryOptions(projectId))
  return <ProjectEditor key={project.id} project={project} initialTab={tab} />
}

function MissingProject() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<LayoutGridIcon />}
        title="We can't find this project"
        description="It may have been deleted."
        className="max-w-lg"
      >
        <Button nativeButton={false} render={<Link to="/projects" />}>
          Back to the projects
        </Button>
      </EmptyState>
    </div>
  )
}
